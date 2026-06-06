import { eq, and, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, contacts } from '@/lib/schema-marketing';

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

  // Coleta mídias (NumMedia + MediaUrlN)
  const numMedia = Number(payload.NumMedia ?? '0') || 0;
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const u = payload[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
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
    .returning({ id: conversations.id });

  if (!conv) return null;

  await db.insert(messages).values({
    conversationId: conv.id,
    twilioSid,
    direction: 'inbound',
    body,
    mediaUrls,
  });

  return conv.id;
}
