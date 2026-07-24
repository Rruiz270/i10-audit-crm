import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, contacts, sends, events, campaigns } from '@/lib/schema-marketing';
import { sendPushToUsers, getAllSubscribedUserIds } from '@/lib/push';

const WINDOW_MS = 24 * 60 * 60 * 1000;

// Tira o prefixo "whatsapp:" do endereço do Twilio → telefone E.164.
function normalizePhone(from: string): string {
  return from.replace(/^whatsapp:/, '').trim();
}

/**
 * Processa uma mensagem WhatsApp recebida (inbound) do Twilio: faz upsert da
 * conversa (1 por telefone) e insere a mensagem. Reabre a janela de 24h.
 * Best-effort: tenta vincular a um contato de marketing pelo telefone.
 */
export async function handleInboundWhatsApp(payload: Record<string, string>): Promise<number | null> {
  const from = payload.From ?? '';
  const phone = normalizePhone(from);
  if (!phone) return null;

  const body = payload.Body ?? '';
  const profileName = payload.ProfileName || null;
  const twilioSid = payload.MessageSid ?? payload.SmsSid ?? null;

  // Coleta mídias (NumMedia + MediaUrlN + MediaContentTypeN). Guardamos como
  // objetos { url, contentType } pra saber renderizar áudio (voice notes) etc.
  // As URLs do Twilio exigem Basic auth pra baixar — o player do thread aponta
  // pro proxy autenticado (/api/marketing/media/[id]/[idx]), não pra essas URLs.
  const numMedia = Number(payload.NumMedia ?? '0') || 0;
  const mediaUrls: { url: string; contentType: string | null }[] = [];
  for (let i = 0; i < numMedia; i++) {
    const u = payload[`MediaUrl${i}`];
    if (u) mediaUrls.push({ url: u, contentType: payload[`MediaContentType${i}`] ?? null });
  }

  // Tenta achar um contato de marketing por whatsapp/phone (best-effort)
  const matchContact = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(or(eq(contacts.whatsapp, phone), eq(contacts.phone, phone)))
    .limit(1);
  const contact = matchContact[0];

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + WINDOW_MS);

  // Upsert da conversa pela unique (channel, wa_phone)
  const [conv] = await db
    .insert(conversations)
    .values({
      channel: 'whatsapp',
      waPhone: phone,
      contactName: profileName ?? contact?.name ?? null,
      contactId: contact?.id ?? null,
      status: 'open',
      windowExpiresAt,
      lastMessageAt: now,
      lastInboundAt: now,
      unread: true,
    })
    .onConflictDoUpdate({
      target: [conversations.channel, conversations.waPhone],
      set: {
        status: 'open',
        windowExpiresAt,
        lastMessageAt: now,
        lastInboundAt: now,
        unread: true,
        // Mantém nome se já tínhamos; preenche se faltava
        contactName: profileName ?? contact?.name ?? undefined,
        closedAt: null,
      },
    })
    .returning({
      id: conversations.id,
      assignedTo: conversations.assignedTo,
      campaignId: conversations.campaignId,
      contactId: conversations.contactId,
    });

  if (!conv) return null;

  await db.insert(messages).values({
    conversationId: conv.id,
    twilioSid,
    direction: 'inbound',
    body,
    mediaUrls,
  });

  // ── Atribuição campanha→conversa (funil "respondido") ────────────────────
  // Best-effort: acha o último send de campanha pra este número, registra
  // wa_replied (1x por send — respostas seguintes não inflam o contador) e
  // vincula a conversa à campanha de origem. Nunca derruba o webhook.
  try {
    const phoneVariants = [phone, phone.replace(/^\+/, ''), `whatsapp:${phone}`];
    const [lastSend] = await db
      .select({ id: sends.id, campaignId: sends.campaignId, contactId: sends.contactId })
      .from(sends)
      .where(inArray(sends.toPhone, phoneVariants))
      .orderBy(desc(sends.id))
      .limit(1);

    if (lastSend) {
      const [alreadyReplied] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.sendId, lastSend.id), eq(events.type, 'wa_replied')))
        .limit(1);

      if (!alreadyReplied) {
        await db.insert(events).values({
          sendId: lastSend.id,
          contactId: lastSend.contactId,
          type: 'wa_replied',
          payload: { text: body.slice(0, 500), conversationId: conv.id },
        });
        await db
          .update(campaigns)
          .set({ repliedCount: sql`${campaigns.repliedCount} + 1` })
          .where(eq(campaigns.id, lastSend.campaignId));
      }

      // Preenche vínculos que faltam na conversa (nunca sobrescreve existentes)
      const link: Partial<typeof conversations.$inferInsert> = {};
      if (!conv.campaignId) link.campaignId = lastSend.campaignId;
      if (!conv.contactId) link.contactId = lastSend.contactId;
      if (Object.keys(link).length > 0) {
        await db.update(conversations).set(link).where(eq(conversations.id, conv.id));
      }
    }
  } catch (err) {
    console.error('atribuição campanha→conversa falhou (best-effort):', err);
  }

  // Push (best-effort — nunca bloqueia/derruba o webhook). Notifica o dono da
  // conversa; se estiver sem dono (fila), avisa todos os inscritos para alguém
  // assumir. Corpo = prévia da mensagem; toque abre direto o chat.
  try {
    const recipients = conv.assignedTo ? [conv.assignedTo] : await getAllSubscribedUserIds();
    const preview = body.trim()
      ? body.length > 120 ? body.slice(0, 117) + '…' : body
      : mediaUrls.length > 0 ? '📎 Anexo recebido' : 'Nova mensagem';
    await sendPushToUsers(recipients, {
      title: profileName ?? contact?.name ?? phone,
      body: preview,
      url: `/atende/c/${conv.id}`,
      tag: `conv-${conv.id}`,
    });
  } catch {
    /* noop — push é acessório */
  }

  return conv.id;
}
