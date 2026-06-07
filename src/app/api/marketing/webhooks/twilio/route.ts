import type { NextRequest } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookLog, sends, events, campaigns, messages } from '@/lib/schema-marketing';
import { addSuppression } from '@/lib/marketing/suppression';
import { handleInboundWhatsApp } from '@/lib/marketing/inbound';

// Statuses de entrega (callback). Se não for um desses e tiver Body → é inbound.
const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered'];

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

  // ── Verificação de assinatura X-Twilio-Signature ────────────────────────
  // Sem isso, o endpoint é público e qualquer um pode forjar inbound/status.
  // Validamos o HMAC do Twilio sobre (URL pública + params). Pode ser desligado
  // em dev/sandbox via TWILIO_VALIDATE_SIGNATURE=false.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const validateSig = authToken && process.env.TWILIO_VALIDATE_SIGNATURE !== 'false';
  if (validateSig) {
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const fullUrl = `${(process.env.MARKETING_BASE_URL ?? '').replace(/\/$/, '')}/api/marketing/webhooks/twilio`;
    try {
      const twilioMod = await import('twilio');
      const validate = (twilioMod.default ?? twilioMod).validateRequest as (
        token: string,
        sig: string,
        url: string,
        params: Record<string, string>,
      ) => boolean;
      if (!validate(authToken, signature, fullUrl, payload)) {
        return Response.json({ ok: false, error: 'invalid signature' }, { status: 403 });
      }
    } catch (err) {
      console.error('twilio signature validation error:', err);
      return Response.json({ ok: false, error: 'signature check failed' }, { status: 403 });
    }
  }

  const messageSid = payload.MessageSid ?? payload.SmsSid;
  const messageStatus = payload.MessageStatus ?? payload.SmsStatus;
  const errorCode = payload.ErrorCode;

  // ── INBOUND (mensagem recebida do contato) ──────────────────────────────
  // Não é um status de entrega E tem Body/mídia → é uma mensagem que chegou.
  // Vai pra inbox de Conversas (upsert da conversa + insere message).
  const isInbound =
    !DELIVERY_STATUSES.includes(messageStatus ?? '') &&
    Boolean(payload.From?.startsWith('whatsapp:')) &&
    (Boolean(payload.Body) || Number(payload.NumMedia ?? '0') > 0);

  if (isInbound) {
    await db.insert(webhookLog).values({
      provider: 'twilio',
      eventType: 'inbound',
      rawPayload: payload,
    });
    try {
      const convId = await handleInboundWhatsApp(payload);
      return Response.json({ ok: true, inbound: true, conversationId: convId });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // 500 → Twilio re-tenta (não perdemos a mensagem do contato)
      return Response.json({ ok: false, error: m }, { status: 500 });
    }
  }

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
    // ── Status de mensagem do INBOX (Conversas) ────────────────────────────
    // Independente de campanha: callbacks de delivery/read das respostas do
    // inbox (sendConversationReply/sendTemplateReply/sendAudioReply) atualizam
    // marketing.messages pelo twilioSid → status (sent/delivered/read/failed).
    // Read receipts no thread (✓ / ✓✓ / ✓✓ azul) leem messages.status.
    let inboxMessageUpdated = false;
    if (messageStatus) {
      const updatedMsg = await db
        .update(messages)
        .set({ status: messageStatus })
        .where(eq(messages.twilioSid, messageSid))
        .returning({ id: messages.id });
      inboxMessageUpdated = updatedMsg.length > 0;
    }

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
      // Se o callback era de uma mensagem do INBOX (não de campanha), já
      // atualizamos messages acima — está tudo certo, devolve ok e não pede
      // retry (não existe send pra esse SID e nunca vai existir).
      if (inboxMessageUpdated) {
        await db
          .update(webhookLog)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookLog.id, logEntry.id));
        return Response.json({ ok: true, inboxMessage: true, messageStatus });
      }

      // Webhook chegou ANTES do send.providerId ser persistido (race condition).
      // Retornamos 503 (não 200) DE PROPÓSITO: assim o Twilio re-tenta o callback
      // naturalmente até o send existir. Retornar ok:true faria o Twilio parar de
      // tentar e o status (inclusive opt-out p/ supressão LGPD) seria perdido.
      await db
        .update(webhookLog)
        .set({ status: 'received', errorMessage: 'send not found yet (race?) — pedindo retry ao Twilio' })
        .where(eq(webhookLog.id, logEntry.id));
      return Response.json({ ok: false, deferred: true, retry: true }, { status: 503 });
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
