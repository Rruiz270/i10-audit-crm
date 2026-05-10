import type { NextRequest } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookLog, sends, events, campaigns } from '@/lib/schema-marketing';
import { addSuppression } from '@/lib/marketing/suppression';

// ─── /api/marketing/webhooks/twilio ───────────────────────────────────────
// Twilio envia StatusCallback POST com application/x-www-form-urlencoded.
// Eventos: queued, sending, sent, delivered, read, failed, undelivered.
// Pra mensagens recebidas (replies): MessagingResponse via webhook separado.
//
// Configurar no Twilio Console:
//   Messaging → Senders → WhatsApp → Status Callback URL:
//   https://crm.institutoi10.com.br/api/marketing/webhooks/twilio
//
// Verificação opcional via X-Twilio-Signature (HMAC do payload).
// Pra MVP, aceitamos sem verificar — em prod, adicionar TWILIO_AUTH_TOKEN check.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Twilio manda urlencoded, não JSON
  const formData = await request.formData();
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = String(value);
  }

  const messageSid = payload.MessageSid ?? payload.SmsSid;
  const messageStatus = payload.MessageStatus ?? payload.SmsStatus;
  const errorCode = payload.ErrorCode;

  // Log o webhook bruto pra debug
  const [logEntry] = await db
    .insert(webhookLog)
    .values({
      provider: 'twilio',
      eventType: messageStatus ?? null,
      rawPayload: payload,
    })
    .returning({ id: webhookLog.id });

  if (!messageSid) {
    return Response.json({ ok: false, error: 'missing MessageSid' }, { status: 400 });
  }

  try {
    // Resolver send pelo providerId (MessageSid foi salvo lá)
    const sendRows = await db
      .select({
        id: sends.id,
        contactId: sends.contactId,
        campaignId: sends.campaignId,
        toPhone: sends.toPhone,
      })
      .from(sends)
      .where(eq(sends.providerId, messageSid))
      .limit(1);

    if (sendRows.length === 0) {
      // Pode ser que o webhook chegou ANTES do send.providerId ser persistido
      // (race condition). Marcar como received e tentar de novo depois.
      await db
        .update(webhookLog)
        .set({ status: 'received', errorMessage: 'send not found yet (race?)' })
        .where(eq(webhookLog.id, logEntry.id));
      return Response.json({ ok: true, deferred: true });
    }

    const send = sendRows[0];

    // Mapear status Twilio → nosso event type
    const eventTypeMap: Record<string, string> = {
      delivered: 'wa_delivered',
      read: 'wa_read',
      failed: 'wa_failed',
      undelivered: 'wa_failed',
    };
    const eventType = eventTypeMap[messageStatus ?? ''] ?? null;

    if (eventType) {
      await db.insert(events).values({
        sendId: send.id,
        contactId: send.contactId,
        type: eventType,
        payload: { messageStatus, errorCode },
        metadata: payload,
      });
    }

    // Side effects baseado no status
    if (messageStatus === 'delivered') {
      await db
        .update(sends)
        .set({ status: 'delivered', deliveredAt: new Date() })
        .where(eq(sends.id, send.id));
      await db
        .update(campaigns)
        .set({ deliveredCount: sql`${campaigns.deliveredCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));
    } else if (messageStatus === 'read') {
      // WA read = equivalent a 'open' no email — incrementa openCount
      await db
        .update(campaigns)
        .set({ openCount: sql`${campaigns.openCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));
    } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      await db
        .update(sends)
        .set({ status: 'failed', errorMessage: `twilio:${errorCode ?? 'unknown'}` })
        .where(eq(sends.id, send.id));
      await db
        .update(campaigns)
        .set({ bounceCount: sql`${campaigns.bounceCount} + 1` })
        .where(eq(campaigns.id, send.campaignId));

      // Twilio errors específicos = unrecoverable, suprimir o número
      // 21610 = unsubscribed, 63003 = channel not found, 21408 = permission denied
      const phoneToSuppress = send.toPhone;
      if (
        phoneToSuppress &&
        ['21610', '63003', '21408', '21211'].includes(String(errorCode ?? ''))
      ) {
        await addSuppression({
          identifier: phoneToSuppress,
          channel: 'whatsapp',
          reason: errorCode === '21610' ? 'unsubscribe' : 'bounce_hard',
          sourceRef: `twilio:${messageSid}:${errorCode}`,
        });
      }
    }

    await db
      .update(webhookLog)
      .set({ status: 'processed', processedAt: new Date(), resolvedSendId: send.id })
      .where(eq(webhookLog.id, logEntry.id));

    return Response.json({ ok: true, sendId: send.id, eventType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(webhookLog)
      .set({ status: 'error', errorMessage: message })
      .where(eq(webhookLog.id, logEntry.id));
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

// Twilio às vezes faz GET pra verificar URL inicial
export async function GET() {
  return Response.json({ ok: true, info: 'twilio whatsapp webhook' });
}
