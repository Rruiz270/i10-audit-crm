import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { webhookLog } from '@/lib/schema-marketing';
import { enqueueJob } from '@/lib/marketing/queue';

// ─── /api/marketing/webhooks/brevo — Brevo event webhook ──────────────────
// Brevo POST envia 1 evento por request OU array. Aceitamos os 2 formatos.
// Persistimos em webhook_log (audit + replay) e enfileiramos process_webhook
// pra processar de forma assíncrona — assim retornamos 200 rápido e o Brevo
// não retransmite por timeout.
//
// Configurar em: Brevo dashboard → Transactional → Settings → Webhook
// URL: https://crm.institutoi10.com.br/api/marketing/webhooks/brevo
// Selecionar todos os eventos: delivered/opened/click/hard_bounce/soft_bounce/unsubscribed/spam

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  // Brevo manda 1 evento OU array — normalizar
  const eventsArray = Array.isArray(body) ? body : [body];

  let logged = 0;
  for (const evt of eventsArray) {
    if (typeof evt !== 'object' || evt === null) continue;
    const eventName =
      (evt as Record<string, unknown>).event ?? (evt as Record<string, unknown>)['event-type'];
    const inserted = await db
      .insert(webhookLog)
      .values({
        provider: 'brevo',
        eventType: eventName ? String(eventName) : null,
        rawPayload: evt as Record<string, unknown>,
      })
      .returning({ id: webhookLog.id });
    await enqueueJob({
      type: 'process_webhook',
      payload: { webhookLogId: inserted[0].id },
      rateBucket: 'webhook',
    });
    logged += 1;
  }

  return Response.json({ ok: true, received: logged });
}

// Brevo às vezes manda HEAD/GET pra verificação inicial
export async function GET() {
  return Response.json({ ok: true, info: 'brevo webhook endpoint' });
}
