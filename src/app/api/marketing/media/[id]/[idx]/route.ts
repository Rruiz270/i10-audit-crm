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

  // Twilio media → Basic auth. Outras URLs (Vercel Blob público) → sem auth.
  const isTwilio = /\.twilio\.com\//i.test(mediaUrl);
  const headers: Record<string, string> = {};
  if (isTwilio) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return new Response('twilio creds missing', { status: 503 });
    headers.Authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  }

  const upstream = await fetch(mediaUrl, { headers, redirect: 'follow' });
  if (!upstream.ok || !upstream.body) {
    return new Response('upstream error', { status: 502 });
  }

  const contentType =
    upstream.headers.get('content-type') ||
    (typeof item === 'object' ? item.contentType : null) ||
    'application/octet-stream';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
