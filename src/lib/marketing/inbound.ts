import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, contacts } from '@/lib/schema-marketing';
import { sendPushToUsers, getAllSubscribedUserIds } from '@/lib/push';
import { maybeAutoReply } from '@/lib/marketing/auto-reply';

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
        // Conversa criada antes de o contato existir ficava órfã para sempre:
        // agora que sabemos quem é, amarramos.
        contactId: contact?.id ?? undefined,
        closedAt: null,
      },
    })
    .returning({ id: conversations.id, assignedTo: conversations.assignedTo });

  if (!conv) return null;

  await db.insert(messages).values({
    conversationId: conv.id,
    twilioSid,
    direction: 'inbound',
    body,
    mediaUrls,
  });

  // Resposta automática da campanha (ex.: tocou em "Quero o material").
  // Em linha de propósito: a janela de 24h acabou de abrir e a promessa é
  // entregar na hora. Best-effort — falhar aqui não pode perder a mensagem.
  try {
    const auto = await maybeAutoReply({
      conversationId: conv.id,
      contactId: contact?.id ?? null,
      phone,
    });
    if (auto.sent) console.log(`[auto-reply] ${auto.projectSlug} → ${phone}`);
  } catch (err) {
    console.error('[auto-reply] falhou (mensagem preservada):', err);
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
