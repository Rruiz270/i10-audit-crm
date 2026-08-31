import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  sends,
  events,
  campaigns,
  templates,
  contacts,
  webhookLog,
} from '../schema-marketing';
import {
  renderEmail,
  renderWhatsAppFreeform,
  renderWhatsAppTemplate,
  generateTrackingToken,
} from './template-engine';
import { isSuppressed, addSuppression } from './suppression';
import { getEmailProvider, getWhatsAppProvider } from './providers';
import { pausePendingBucket, type ClaimedJob } from './queue';

// ─── Send pipeline — handlers de jobs da queue ────────────────────────────
// Cada handler recebe o payload do job, faz o trabalho, retorna sucesso/falha.
// Worker (cron drain) cuida de retry/dead-letter via queue.failJob.

type HandlerResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean; retryAfterSeconds?: number };

// ─── send_email handler ──────────────────────────────────────────────────
// Payload esperado: { sendId: number }
// Lê send + campaign + template + contact, renderiza, chama provider, grava.
export async function handleSendEmail(payload: Record<string, unknown>): Promise<HandlerResult> {
  const sendId = Number(payload.sendId);
  if (!sendId) return { ok: false, error: 'missing sendId in payload', retryable: false };

  // Carregar send + dados relacionados em 1 query
  const rows = await db
    .select({
      send: sends,
      campaign: campaigns,
      template: templates,
      contact: contacts,
    })
    .from(sends)
    .innerJoin(campaigns, eq(sends.campaignId, campaigns.id))
    .innerJoin(templates, eq(campaigns.templateId, templates.id))
    .innerJoin(contacts, eq(sends.contactId, contacts.id))
    .where(eq(sends.id, sendId))
    .limit(1);

  if (rows.length === 0) return { ok: false, error: `send ${sendId} not found`, retryable: false };
  const { send, campaign, template, contact } = rows[0];

  // Idempotência: se já enviado, não reenvia
  if (send.status === 'sent' || send.status === 'delivered') {
    return { ok: true };
  }

  // Re-check suppression (pode ter sido adicionada depois do enqueue)
  const toEmail = send.toEmail ?? contact.email;
  if (!toEmail) {
    await markSendFailed(sendId, 'no email address on send/contact');
    return { ok: false, error: 'no email address', retryable: false };
  }
  if (await isSuppressed(toEmail, 'email')) {
    await markSendFailed(sendId, 'suppressed before send');
    return { ok: true }; // não é erro do worker — já filtramos
  }

  // ─── Safety net: TEST MODE allowlist ──────────────────────────────────
  // Se MARKETING_TEST_ALLOWLIST estiver setada, bloqueia QUALQUER envio
  // para emails fora da lista. Defense-in-depth pra evitar disparo
  // acidental em dev. Em prod, simplesmente não setar a env var.
  const allowlistRaw = process.env.MARKETING_TEST_ALLOWLIST;
  if (allowlistRaw) {
    const allowed = allowlistRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(toEmail.toLowerCase())) {
      await markSendFailed(
        sendId,
        `blocked_test_mode: ${toEmail} não está em MARKETING_TEST_ALLOWLIST (${allowed.length} permitidos)`,
      );
      return { ok: true }; // não é erro — é proteção esperada
    }
  }

  // Renderizar
  if (!template.html || !template.subject) {
    return {
      ok: false,
      error: `template ${template.id} missing html/subject`,
      retryable: false,
    };
  }
  const rendered = renderEmail(
    { subject: template.subject, html: template.html },
    (send.mergeVars ?? {}) as Record<string, unknown>,
    {
      trackingBaseUrl: process.env.MARKETING_BASE_URL ?? 'http://localhost:3001',
      trackingToken: send.trackingToken,
      unsubscribeSecret: process.env.MARKETING_UNSUB_SECRET ?? 'dev-secret',
      recipientEmail: toEmail,
      senderIdentity: {
        name: process.env.MARKETING_FROM_NAME ?? 'Instituto i10',
        email: process.env.MARKETING_FROM_EMAIL ?? 'contato@institutoi10.org.br',
      },
    },
  );

  // Marcar como sending antes de chamar provider (defensivo se crashar entre)
  await db.update(sends).set({ status: 'sending' }).where(eq(sends.id, sendId));

  // Provider call
  const provider = getEmailProvider(campaign.provider ?? undefined);
  const result = await provider.send({
    fromEmail: process.env.MARKETING_FROM_EMAIL ?? 'contato@institutoi10.org.br',
    fromName: process.env.MARKETING_FROM_NAME,
    to: { email: toEmail, name: contact.name ?? undefined },
    replyTo: process.env.MARKETING_REPLY_TO,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': rendered.listUnsubscribeHeader,
      'List-Unsubscribe-Post': rendered.listUnsubscribePostHeader,
      'X-Send-Id': String(sendId),
    },
    tag: String(sendId),
  });

  if (result.ok) {
    await db
      .update(sends)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerId: result.providerId,
        provider: result.provider,
      })
      .where(eq(sends.id, sendId));
    // Incrementar contador no campaign (atomicamente)
    await db
      .update(campaigns)
      .set({ sentCount: sql`${campaigns.sentCount} + 1` })
      .where(eq(campaigns.id, campaign.id));
    return { ok: true };
  }

  // Falha do provider
  await db
    .update(sends)
    .set({ status: result.retryable ? 'queued' : 'failed', errorMessage: result.error })
    .where(eq(sends.id, sendId));
  return { ok: false, error: result.error, retryable: result.retryable };
}

async function markSendFailed(sendId: number, message: string) {
  await db
    .update(sends)
    .set({ status: 'failed', errorMessage: message })
    .where(eq(sends.id, sendId));
}

// ─── send_whatsapp handler ────────────────────────────────────────────────
// Payload: { sendId: number }
// Lê send + campaign + template + contact, renderiza WA, chama Twilio.
// Mesma estrutura do send_email mas com phone como destino + WhatsApp provider.
export async function handleSendWhatsApp(payload: Record<string, unknown>): Promise<HandlerResult> {
  const sendId = Number(payload.sendId);
  if (!sendId) return { ok: false, error: 'missing sendId in payload', retryable: false };

  const rows = await db
    .select({
      send: sends,
      campaign: campaigns,
      template: templates,
      contact: contacts,
    })
    .from(sends)
    .innerJoin(campaigns, eq(sends.campaignId, campaigns.id))
    .innerJoin(templates, eq(campaigns.templateId, templates.id))
    .innerJoin(contacts, eq(sends.contactId, contacts.id))
    .where(eq(sends.id, sendId))
    .limit(1);

  if (rows.length === 0) return { ok: false, error: `send ${sendId} not found`, retryable: false };
  const { send, campaign, template, contact } = rows[0];

  if (send.status === 'sent' || send.status === 'delivered') return { ok: true };

  const phone = send.toPhone ?? contact.whatsapp ?? contact.phone;
  if (!phone) {
    await markSendFailed(sendId, 'no phone/whatsapp on contact');
    return { ok: false, error: 'no phone', retryable: false };
  }

  // Suppression check (channel='whatsapp')
  if (await isSuppressed(phone, 'whatsapp')) {
    await markSendFailed(sendId, 'suppressed before send');
    return { ok: true };
  }

  // Test allowlist (também aplica a phones em modo teste)
  const allowlistRaw = process.env.MARKETING_TEST_ALLOWLIST_PHONE;
  if (allowlistRaw) {
    const allowed = allowlistRaw.split(',').map((s) => s.trim().replace(/\D/g, ''));
    const phoneDigits = phone.replace(/\D/g, '');
    const allowedHit = allowed.some((a) => phoneDigits.endsWith(a) || a.endsWith(phoneDigits));
    if (!allowedHit) {
      await markSendFailed(
        sendId,
        `blocked_test_mode: ${phone} não está em MARKETING_TEST_ALLOWLIST_PHONE`,
      );
      return { ok: true };
    }
  }

  // Renderizar — se template tem waTemplateName, usa template approved; senão freeform
  const mergeVars = (send.mergeVars ?? {}) as Record<string, unknown>;
  let rendered;
  if (template.waTemplateName) {
    rendered = renderWhatsAppTemplate(template.variables ?? [], mergeVars);
  } else if (template.text) {
    rendered = renderWhatsAppFreeform(template.text, mergeVars);
  } else {
    return { ok: false, error: 'WA template missing waTemplateName or text body', retryable: false };
  }

  await db.update(sends).set({ status: 'sending' }).where(eq(sends.id, sendId));

  const provider = getWhatsAppProvider(campaign.provider ?? undefined);
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: phone,
    body: rendered.body || undefined,
    templateName: template.waTemplateName ?? undefined,
    templateLanguage: template.waTemplateLanguage ?? 'pt_BR',
    templateVariables: rendered.twilioContentVariables,
    tag: String(sendId),
  });

  if (result.ok) {
    await db
      .update(sends)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerId: result.providerId,
        provider: result.provider,
      })
      .where(eq(sends.id, sendId));
    await db
      .update(campaigns)
      .set({ sentCount: sql`${campaigns.sentCount} + 1` })
      .where(eq(campaigns.id, campaign.id));
    return { ok: true };
  }

  // Erros de create-time que indicam número morto/opt-out nunca geram
  // StatusCallback — a supressão do webhook (twilio/route.ts) não cobre esse
  // caso e o número seria re-tentado a cada campanha. Mesmo mapeamento de
  // reason do webhook: 21610=opt-out, 63003/21211=número inválido.
  if (result.errorCode && ['63003', '21211', '21610'].includes(result.errorCode)) {
    await addSuppression({
      identifier: phone,
      channel: 'whatsapp',
      reason: result.errorCode === '21610' ? 'unsubscribe' : 'bounce_hard',
      sourceRef: `twilio:send:${sendId}:${result.errorCode}`,
    });
  }

  // Saturação (63049/63018): pausa o bucket inteiro — os demais jobs pending
  // do mesmo provider bateriam no mesmo limite e queimariam attempts à toa.
  if (result.retryable && result.retryAfterSeconds) {
    await pausePendingBucket(campaign.provider ?? 'twilio', result.retryAfterSeconds);
  }

  await db
    .update(sends)
    .set({ status: result.retryable ? 'queued' : 'failed', errorMessage: result.error })
    .where(eq(sends.id, sendId));
  return {
    ok: false,
    error: result.error,
    retryable: result.retryable,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

// ─── process_webhook handler ──────────────────────────────────────────────
// Payload: { webhookLogId: number }
// Lê o webhook bruto e processa baseado no provider.
export async function handleProcessWebhook(
  payload: Record<string, unknown>,
): Promise<HandlerResult> {
  const webhookLogId = Number(payload.webhookLogId);
  if (!webhookLogId)
    return { ok: false, error: 'missing webhookLogId in payload', retryable: false };

  const rows = await db
    .select()
    .from(webhookLog)
    .where(eq(webhookLog.id, webhookLogId))
    .limit(1);
  if (rows.length === 0)
    return { ok: false, error: `webhook log ${webhookLogId} not found`, retryable: false };

  const log = rows[0];
  if (log.status === 'processed') return { ok: true };

  try {
    if (log.provider === 'brevo') {
      await processBrevoWebhook(log.id, log.rawPayload as Record<string, unknown>);
    } else if (log.provider === 'ses') {
      await processSesWebhook(log.id, log.rawPayload as Record<string, unknown>);
    } else {
      return {
        ok: false,
        error: `unknown webhook provider: ${log.provider}`,
        retryable: false,
      };
    }
    await db
      .update(webhookLog)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(webhookLog.id, log.id));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(webhookLog)
      .set({ status: 'error', errorMessage: message })
      .where(eq(webhookLog.id, log.id));
    return { ok: false, error: message, retryable: true };
  }
}

// ─── Webhook processors ────────────────────────────────────────────────────

async function processBrevoWebhook(
  webhookLogId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  // Brevo manda eventos individuais. Campos relevantes:
  //   event: 'delivered' | 'opened' | 'click' | 'hard_bounce' | 'soft_bounce' | 'unsubscribed' | 'spam'
  //   email: 'destinatario@...'
  //   message-id: ID retornado por SendEmail (vai no providerId)
  //   tag: o que passamos como tag (= sendId interno nosso)
  const eventName = String(payload.event ?? '');
  const email = String(payload.email ?? '').toLowerCase();
  const tag = payload.tag ? String(payload.tag) : null;
  // Resolver send via tag (mais confiável que message-id que vem em formatos diferentes)
  let sendId: number | null = null;
  if (tag && /^\d+$/.test(tag)) sendId = Number(tag);
  if (!sendId && payload['message-id']) {
    const rows = await db
      .select({ id: sends.id })
      .from(sends)
      .where(eq(sends.providerId, String(payload['message-id'])))
      .limit(1);
    if (rows[0]) sendId = rows[0].id;
  }
  if (!sendId) return; // não conseguimos correlacionar — log fica como processed mas sem ação

  // Resolver contactId
  const sendRow = await db
    .select({ contactId: sends.contactId, campaignId: sends.campaignId })
    .from(sends)
    .where(eq(sends.id, sendId))
    .limit(1);
  if (sendRow.length === 0) return;
  const { contactId, campaignId } = sendRow[0];

  // Mapear evento Brevo -> nosso tipo
  const eventMap: Record<string, string> = {
    delivered: 'delivered',
    opened: 'open',
    click: 'click',
    hard_bounce: 'bounce_hard',
    soft_bounce: 'bounce_soft',
    unsubscribed: 'unsubscribed',
    spam: 'complained',
  };
  const internalType = eventMap[eventName];
  if (!internalType) return;

  // Gravar evento
  await db.insert(events).values({
    sendId,
    contactId,
    type: internalType,
    payload: { source: 'brevo', original: eventName, ...payload },
  });

  // Side effects baseado no tipo
  if (internalType === 'delivered') {
    await db
      .update(sends)
      .set({ status: 'delivered', deliveredAt: new Date() })
      .where(eq(sends.id, sendId));
    await db
      .update(campaigns)
      .set({ deliveredCount: sql`${campaigns.deliveredCount} + 1` })
      .where(eq(campaigns.id, campaignId));
  } else if (internalType === 'open') {
    await db
      .update(campaigns)
      .set({ openCount: sql`${campaigns.openCount} + 1` })
      .where(eq(campaigns.id, campaignId));
  } else if (internalType === 'click') {
    await db
      .update(campaigns)
      .set({ clickCount: sql`${campaigns.clickCount} + 1` })
      .where(eq(campaigns.id, campaignId));
  } else if (internalType === 'bounce_hard') {
    await db
      .update(campaigns)
      .set({ bounceCount: sql`${campaigns.bounceCount} + 1` })
      .where(eq(campaigns.id, campaignId));
    if (email) {
      await addSuppression({
        identifier: email,
        channel: 'email',
        reason: 'bounce_hard',
        sourceRef: `brevo:webhook:${webhookLogId}`,
      });
    }
  } else if (internalType === 'unsubscribed') {
    await db
      .update(campaigns)
      .set({ unsubscribeCount: sql`${campaigns.unsubscribeCount} + 1` })
      .where(eq(campaigns.id, campaignId));
    if (email) {
      await addSuppression({
        identifier: email,
        channel: 'email',
        reason: 'unsubscribe',
        sourceRef: `brevo:webhook:${webhookLogId}`,
      });
    }
  } else if (internalType === 'complained') {
    await db
      .update(campaigns)
      .set({ complaintCount: sql`${campaigns.complaintCount} + 1` })
      .where(eq(campaigns.id, campaignId));
    if (email) {
      await addSuppression({
        identifier: email,
        channel: 'email',
        reason: 'complaint',
        sourceRef: `brevo:webhook:${webhookLogId}`,
      });
    }
  }
}

async function processSesWebhook(
  _webhookLogId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  // SES manda via SNS — payload aninhado em Message como JSON string.
  // Implementaremos quando ativarmos SES (fase 2 do warm-up).
  // Stub aqui pra estrutura ficar pronta.
  const messageStr = payload.Message;
  if (typeof messageStr !== 'string') return;
  // No-op por enquanto — não derruba o webhook log
  return;
}

// ─── Job dispatcher — chamado pelo cron drain pra cada job claimed ────────
export async function dispatchJob(job: ClaimedJob): Promise<HandlerResult> {
  switch (job.type) {
    case 'send_email':
      return handleSendEmail(job.payload);
    case 'process_webhook':
      return handleProcessWebhook(job.payload);
    case 'send_whatsapp':
      return handleSendWhatsApp(job.payload);
    case 'advance_sequence':
      return { ok: false, error: 'sequences not implemented yet (fase 2)', retryable: false };
    default:
      return { ok: false, error: `unknown job type: ${job.type}`, retryable: false };
  }
}
