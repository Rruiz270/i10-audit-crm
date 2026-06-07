import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages } from '@/lib/schema-marketing';
import { getConversation } from '@/lib/actions/marketing/conversations';

// ─── /api/marketing/media/[id]/[idx] ───────────────────────────────────────
// Proxy autenticado pra mídia de uma mensagem do inbox (ex: voice notes).
// As MediaUrl do Twilio exigem Basic auth (accountSid:authToken) pra baixar —
// um <audio src=twilioMediaUrl> direto no browser daria 401. Aqui buscamos a
// mídia server-side (com auth quando for URL do Twilio) e re-streamamos.
//
// Gate de visibilidade: reusa getConversation(convId) (regras F3 de papel/fila)
// — só quem pode ver a conversa baixa a mídia. URLs de outras origens (ex:
// Vercel Blob, que já é público) são repassadas sem credencial.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MediaItem = { url: string; contentType: string | null } | string;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; idx: string }> },
) {
  const { id: idStr, idx: idxStr } = await ctx.params;
  const messageId = Number(idStr);
  const idx = Number(idxStr);
  if (!Number.isFinite(messageId) || !Number.isFinite(idx) || idx < 0) {
    return new Response('bad request', { status: 400 });
  }

  const [msg] = await db
    .select({ conversationId: messages.conversationId, mediaUrls: messages.mediaUrls })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!msg) return new Response('not found', { status: 404 });

  // Guard de visibilidade (lança UNAUTHORIZED se sem sessão; null se sem acesso).
  let visible: Awaited<ReturnType<typeof getConversation>>;
  try {
    visible = await getConversation(msg.conversationId);
  } catch {
    return new Response('unauthorized', { status: 401 });
  }
  if (!visible) return new Response('forbidden', { status: 403 });

  const media = (msg.mediaUrls as MediaItem[] | null) ?? [];
  const item = media[idx];
  if (!item) return new Response('not found', { status: 404 });
  const mediaUrl = typeof item === 'string' ? item : item.url;
  if (!mediaUrl) return new Response('not found', { status: 404 });

  // Allowlist EXATA de host (match por hostname, não substring) — evita bypass
  // tipo "https://evil.com/.twilio.com/" e SSRF. Só duas famílias: mídia do
  // Twilio (precisa de auth) e Vercel Blob (público, sem auth).
  const isTwilioHost = (h: string) => h.endsWith('.twilio.com') || h.endsWith('.twiliocdn.com');
  const isBlobHost = (h: string) => h.endsWith('.blob.vercel-storage.com');
  const allowedHost = (h: string) => isTwilioHost(h) || isBlobHost(h);

  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return new Response('bad media url', { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !allowedHost(parsed.hostname.toLowerCase())) {
    return new Response('media host not allowed', { status: 400 });
  }

  // Credencial Twilio SÓ para host Twilio; nunca é repassada num redirect.
  let auth: string | undefined;
  if (isTwilioHost(parsed.hostname.toLowerCase())) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return new Response('twilio creds missing', { status: 503 });
    auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  }

  // Redirect manual: a Media URL do Twilio redireciona pro CDN assinado.
  // Só seguimos pra host permitido e SEM levar credencial adiante.
  let url = parsed.toString();
  let upstream: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    const reqHeaders: Record<string, string> = {};
    if (auth) reqHeaders.Authorization = auth;
    const res = await fetch(url, { headers: reqHeaders, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return new Response('bad redirect', { status: 502 });
      const next = new URL(loc, url);
      if (next.protocol !== 'https:' || !allowedHost(next.hostname.toLowerCase())) {
        return new Response('redirect host not allowed', { status: 502 });
      }
      url = next.toString();
      auth = undefined; // CDN assinado não precisa de credencial — nunca vaza
      continue;
    }
    upstream = res;
    break;
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response('upstream error', { status: 502 });
  }

  // Content-Type forçado por allowlist (evita XSS armazenado na nossa origem):
  // tipos perigosos (text/html, svg, js) viram octet-stream + attachment.
  const ALLOWED = new Set([
    'audio/ogg', 'audio/opus', 'application/ogg', 'audio/webm', 'audio/mpeg',
    'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/3gpp',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf',
  ]);
  const rawCt = (
    upstream.headers.get('content-type') ||
    (typeof item === 'object' ? item.contentType : null) ||
    ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();
  const allowed = ALLOWED.has(rawCt);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': allowed ? rawCt : 'application/octet-stream',
      'Content-Disposition': allowed ? 'inline' : 'attachment; filename="media"',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
