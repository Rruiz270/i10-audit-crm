'use server';

import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { getWhatsAppProvider } from '@/lib/marketing/providers';

export type ConversationRow = typeof conversations.$inferSelect;

// Lista conversas (admin vê todas). Filtro opcional por status.
export async function listConversations(opts?: { status?: string }) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const where = opts?.status ? eq(conversations.status, opts.status) : undefined;
  return db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
}

export async function getConversation(id: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { conversation: conv, messages: msgs };
}

// Marca como lida ao abrir
export async function markConversationRead(id: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  await db.update(conversations).set({ unread: false }).where(eq(conversations.id, id));
}

function blockedByTestAllowlist(phone: string): boolean {
  const allow = process.env.MARKETING_TEST_ALLOWLIST_PHONE;
  if (!allow) return false;
  const digits = phone.replace(/\D/g, '');
  const ok = allow
    .split(',')
    .map((s) => s.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .some((a) => digits.endsWith(a) || a.endsWith(digits));
  return !ok;
}

// Responde uma conversa com mensagem livre (só dentro da janela de 24h).
export async function sendConversationReply(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const conversationId = Number(formData.get('conversationId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!conversationId || !body) throw new Error('conversationId e body obrigatórios');

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) throw new Error('conversa não encontrada');

  // Trava da janela de 24h: fora dela, freeform é bloqueado pela Meta (erro 63016).
  const expired = !conv.windowExpiresAt || new Date(conv.windowExpiresAt).getTime() < Date.now();
  if (expired) {
    throw new Error('Janela de 24h expirada — responder fora dela exige template aprovado (em breve no inbox).');
  }

  if (blockedByTestAllowlist(conv.waPhone)) {
    throw new Error('Modo de teste: número fora da allowlist. Resposta bloqueada.');
  }

  // Envia via provider WhatsApp (freeform)
  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: conv.waPhone,
    body,
  });

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.ok ? result.providerId : null,
    direction: 'outbound',
    authorUserId: user.id,
    body,
    status: result.ok ? 'sent' : 'failed',
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      unread: false,
      // ao responder, assume a conversa se ninguém tinha
      assignedTo: conv.assignedTo ?? user.id,
      status: conv.status === 'closed' ? 'open' : conv.status,
    })
    .where(eq(conversations.id, conversationId));

  if (!result.ok) {
    throw new Error(`Falha no envio: ${result.error}`);
  }

  revalidatePath('/marketing/conversas');
}

export async function claimConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const conversationId = Number(formData.get('conversationId'));
  await db
    .update(conversations)
    .set({ assignedTo: user.id })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}

export async function closeConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const conversationId = Number(formData.get('conversationId'));
  await db
    .update(conversations)
    .set({ status: 'closed', closedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}
