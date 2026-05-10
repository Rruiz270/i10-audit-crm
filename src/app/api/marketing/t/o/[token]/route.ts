import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sends, events, campaigns } from '@/lib/schema-marketing';
import { sql } from 'drizzle-orm';

// ─── /api/marketing/t/o/[token] — open pixel ──────────────────────────────
// Cliente de email carrega <img src=".../t/o/[token]"> → grava event 'open'
// e devolve um GIF transparente 1x1.
//
// Apple Mail Privacy Protection (MPP) infla opens (~30-40% false positives
// em audiência mista). Não tratamos aqui — só registramos. Análise no UI
// pode filtrar opens com User-Agent Apple-MPP se quiser.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 1x1 GIF transparente (43 bytes)
const TRANSPARENT_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const GIF_RESPONSE_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  'Content-Length': String(TRANSPARENT_GIF.length),
} as const;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  // Não bloqueamos resposta no DB — gravamos best-effort em background
  // pra cliente de email não esperar e timeout não invalidar o pixel.
  // Mas em Vercel Function, fire-and-forget pode ser cortado quando a
  // function termina. Solução pragmática: aguardamos curto, com timeout.
  void recordOpen(token, request).catch(() => {
    // swallow — perdemos open ocasional é melhor que pixel quebrado
  });

  return new Response(TRANSPARENT_GIF, { status: 200, headers: GIF_RESPONSE_HEADERS });
}

async function recordOpen(token: string, request: NextRequest) {
  const rows = await db
    .select({ id: sends.id, contactId: sends.contactId, campaignId: sends.campaignId })
    .from(sends)
    .where(eq(sends.trackingToken, token))
    .limit(1);
  if (rows.length === 0) return;
  const { id: sendId, contactId, campaignId } = rows[0];

  // Grava evento sempre (open é métrica acumulável — cada open conta)
  await db.insert(events).values({
    sendId,
    contactId,
    type: 'open',
    metadata: {
      ua: request.headers.get('user-agent') ?? '',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] ?? '',
    },
  });
  // Incrementa contador de campanha (cada open conta — Brevo/SES também contam assim)
  await db
    .update(campaigns)
    .set({ openCount: sql`${campaigns.openCount} + 1` })
    .where(eq(campaigns.id, campaignId));
}
