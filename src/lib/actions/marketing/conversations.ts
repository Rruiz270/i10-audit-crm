'use server';

import { eq, desc, and, or, inArray, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { conversations, messages, userProjects } from '@/lib/schema-marketing';
import { requireUser, type SessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/roles';
import { getWhatsAppProvider } from '@/lib/marketing/providers';

export type ConversationRow = typeof conversations.$inferSelect;

// ─── F3 — escopo de visibilidade (papéis & filas por projeto) ──────────────
// SUPERVISOR (admin/gestor): vê TUDO (todos os projetos, inclusive sem projeto).
// AGENTE (consultor): vê só conversas cujo projectId está nas suas memberships
//   (marketing.user_projects) OU que estejam atribuídas diretamente a ele.
//   Conversas com projectId = null NUNCA aparecem para agentes (triagem só
//   admin/gestor) — evita vazar contatos ainda não roteados.

// Carrega os projectIds que o usuário pode ver. Vazio = sem fila atribuída.
async function getUserProjectIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ projectId: userProjects.projectId })
    .from(userProjects)
    .where(eq(userProjects.userId, userId));
  return rows.map((r) => r.projectId);
}

// Constrói o filtro WHERE de visibilidade do usuário sobre conversations.
// Para admin/gestor → undefined (sem restrição).
// Para agente → (project_id IN memberships) OR (assigned_to = user.id).
//   Se não tem memberships nem nada atribuído, retorna uma condição
//   impossível (id = -1) para garantir resultado vazio sem 500.
async function visibilityWhere(user: SessionUser): Promise<SQL | undefined> {
  if (isAdmin(user.role)) return undefined;
  const projectIds = await getUserProjectIds(user.id);
  const clauses: SQL[] = [eq(conversations.assignedTo, user.id)];
  if (projectIds.length > 0) {
    // projectId IN (...) — implicitamente exclui project_id = null.
    clauses.push(inArray(conversations.projectId, projectIds));
  }
  const combined = or(...clauses);
  return combined ?? eq(conversations.id, -1);
}

// Re-checagem por-conversa (usada após carregar 1 conversa por id).
// Mesma lógica do WHERE, mas aplicada em memória — guarda getConversation/
// sendReply/claim/close contra IDs adivinhados.
function canSeeConversation(
  user: SessionUser,
  conv: Pick<ConversationRow, 'projectId' | 'assignedTo'>,
  projectIds: number[],
): boolean {
  if (isAdmin(user.role)) return true;
  if (conv.assignedTo && conv.assignedTo === user.id) return true;
  if (conv.projectId != null && projectIds.includes(conv.projectId)) return true;
  return false;
}

// true se o usuário tem QUALQUER acesso ao inbox (≥1 membership) ou é admin.
export async function hasConversationAccess(): Promise<boolean> {
  const user = await requireUser();
  if (isAdmin(user.role)) return true;
  const ids = await getUserProjectIds(user.id);
  return ids.length > 0;
}

// Lista conversas escopadas pela visibilidade do caller. Filtro opcional por status.
export async function listConversations(opts?: { status?: string }) {
  const user = await requireUser();
  const vis = await visibilityWhere(user);
  const statusClause = opts?.status ? eq(conversations.status, opts.status) : undefined;
  const where =
    vis && statusClause ? and(vis, statusClause) : (vis ?? statusClause);
  return db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
}

export async function getConversation(id: number) {
  const user = await requireUser();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return null;
  // Re-checagem de visibilidade: não vaza conversa por id adivinhado.
  const projectIds = isAdmin(user.role) ? [] : await getUserProjectIds(user.id);
  if (!canSeeConversation(user, conv, projectIds)) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { conversation: conv, messages: msgs };
}

// Carrega a conversa e garante que o usuário pode vê-la. Lança em caso contrário.
async function loadVisibleConversation(user: SessionUser, id: number): Promise<ConversationRow> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) throw new Error('conversa não encontrada');
  const projectIds = isAdmin(user.role) ? [] : await getUserProjectIds(user.id);
  if (!canSeeConversation(user, conv, projectIds)) throw new Error('FORBIDDEN');
  return conv;
}

// Marca como lida ao abrir
export async function markConversationRead(id: number) {
  const user = await requireUser();
  await loadVisibleConversation(user, id);
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
  const conversationId = Number(formData.get('conversationId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!conversationId || !body) throw new Error('conversationId e body obrigatórios');

  // Re-checa visibilidade ANTES de qualquer mutação (guarda contra id adivinhado).
  const conv = await loadVisibleConversation(user, conversationId);

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
  const conversationId = Number(formData.get('conversationId'));
  await loadVisibleConversation(user, conversationId);
  await db
    .update(conversations)
    .set({ assignedTo: user.id })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}

export async function closeConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  await loadVisibleConversation(user, conversationId);
  await db
    .update(conversations)
    .set({ status: 'closed', closedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}
