import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sends, events, campaigns } from '@/lib/schema-marketing';
import { sql } from 'drizzle-orm';

// ─── /api/marketing/t/c/[token] — click redirect ──────────────────────────
// Recebe ?l=<linkId>&u=<encoded URL final>. Loga evento 'click' e redireciona.
// Se URL inválida ou faltando, redireciona pra raiz pra não quebrar UX.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(request.url);
  const linkId = url.searchParams.get('l');
  const encodedTarget = url.searchParams.get('u');
  const target = encodedTarget ? safeDecodeUrl(encodedTarget) : null;

  // Redireciona PRIMEIRO pra UX rápido — log roda em background.
  void recordClick(token, linkId, target, request).catch(() => {});

  if (target && isSafeRedirect(target)) {
    return Response.redirect(target, 302);
  }
  // Fallback: vai pra LP do projeto/instituto
  return Response.redirect('https://institutoi10.org.br', 302);
}

function safeDecodeUrl(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

// Permite só http(s) — bloqueia javascript:, data:, file:, etc
function isSafeRedirect(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function recordClick(
  token: string,
  linkId: string | null,
  target: string | null,
  request: NextRequest,
) {
  const rows = await db
    .select({ id: sends.id, contactId: sends.contactId, campaignId: sends.campaignId })
    .from(sends)
    .where(eq(sends.trackingToken, token))
    .limit(1);
  if (rows.length === 0) return;
  const { id: sendId, contactId, campaignId } = rows[0];

  await db.insert(events).values({
    sendId,
    contactId,
    type: 'click',
    payload: { linkId, target },
    metadata: {
      ua: request.headers.get('user-agent') ?? '',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] ?? '',
    },
  });
  await db
    .update(campaigns)
    .set({ clickCount: sql`${campaigns.clickCount} + 1` })
    .where(eq(campaigns.id, campaignId));
}
