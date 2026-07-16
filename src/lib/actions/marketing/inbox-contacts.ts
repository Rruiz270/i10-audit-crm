'use server';

import { and, eq, ilike, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { contacts, conversations } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { ADMIN_ROLES } from '@/lib/roles';

// ─── Inbox ⇄ contatos (F3.x) — buscar/iniciar conversa com a base unificada ──
// Tudo aqui é gated em admin/gestor (SUPERVISOR): só quem vê toda a triagem
// pode iniciar conversas frias e cadastrar contatos. Quem inicia vira o
// assignedTo (assim a conversa entra no escopo F3 do próprio criador).

// Normaliza um telefone para o formato usado nas conversas (E.164 sem
// prefixo "whatsapp:"), consistente com o handler de inbound.
function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/, '').trim();
}

export type ContactSearchResult = {
  id: number;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  municipio: string | null;
  uf: string | null;
  hasConversation: boolean;
  conversationId: number | null;
};

// Busca contatos na base unificada (marketing.contacts) por nome/telefone/
// whatsapp. Parametrizado via ilike (sem injeção). LIMIT 10. Para cada match,
// procura uma conversa WhatsApp existente pelo telefone/whatsapp.
export async function searchContacts(q: string): Promise<ContactSearchResult[]> {
  const user = await requireUser();
  requireRole(user, [...ADMIN_ROLES]);

  const query = q.trim();
  if (query.length < 2) return [];
  const term = `%${query}%`;

  const matchClause = or(
    ilike(contacts.name, term),
    ilike(contacts.phone, term),
    ilike(contacts.whatsapp, term),
  );

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      municipio: contacts.municipio,
      uf: contacts.uf,
    })
    .from(contacts)
    .where(matchClause)
    .limit(10);

  // Para cada contato, descobre se já há conversa WhatsApp pelo telefone.
  return Promise.all(
    rows.map(async (r) => {
      const phone = r.whatsapp ?? r.phone;
      let conversationId: number | null = null;
      if (phone) {
        const normalized = normalizePhone(phone);
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(eq(conversations.channel, 'whatsapp'), eq(conversations.waPhone, normalized)),
          )
          .limit(1);
        conversationId = conv?.id ?? null;
      }
      return {
        ...r,
        hasConversation: conversationId != null,
        conversationId,
      };
    }),
  );
}

// Inicia (ou reabre) uma conversa WhatsApp com um contato existente. Se já há
// conversa pelo telefone, redireciona para ela; senão cria uma "fria"
// (windowExpiresAt=null → composer exibe template picker). assignedTo = criador.
export async function startConversationWithContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, [...ADMIN_ROLES]);

  const contactIdRaw = formData.get('contactId');
  const phoneRaw = String(formData.get('phone') ?? '').trim();

  let contactId: number | null = null;
  let contactName: string | null = null;
  let phone = phoneRaw;

  if (contactIdRaw) {
    const id = Number(contactIdRaw);
    const [c] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        whatsapp: contacts.whatsapp,
      })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);
    if (!c) throw new Error('contato não encontrado');
    contactId = c.id;
    contactName = c.name;
    phone = c.whatsapp ?? c.phone ?? phoneRaw;
  }

  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('telefone obrigatório para iniciar a conversa');

  const conversationId = await ensureConversation(normalized, contactId, contactName, user.id);
  redirect(`/marketing/conversas?c=${conversationId}`);
}

// Cadastra rápido um contato (nome+telefone[+email]) e já inicia a conversa.
// Dedup: reusa contato com mesmo telefone/whatsapp ou email; senão insere.
export async function createContactQuick(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, [...ADMIN_ROLES]);

  const name = String(formData.get('name') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase() || null;
  if (!name) throw new Error('nome obrigatório');
  if (!phoneRaw) throw new Error('telefone obrigatório');

  const phone = normalizePhone(phoneRaw);

  // Dedup por telefone/whatsapp ou email.
  const dedupClauses = [eq(contacts.phone, phone), eq(contacts.whatsapp, phone)];
  if (email) dedupClauses.push(eq(contacts.email, email));
  const [existing] = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(or(...dedupClauses))
    .limit(1);

  let contactId: number;
  let contactName: string | null;
  if (existing) {
    contactId = existing.id;
    contactName = existing.name ?? name;
  } else {
    const [inserted] = await db
      .insert(contacts)
      .values({
        name,
        phone,
        whatsapp: phone,
        email,
        source: 'manual',
        status: 'active',
      })
      .returning({ id: contacts.id });
    contactId = inserted.id;
    contactName = name;
  }

  const conversationId = await ensureConversation(phone, contactId, contactName, user.id);
  redirect(`/marketing/conversas?c=${conversationId}`);
}

// Normaliza para E.164 (+55...). Aceita o que o atendente digitar (com espaços,
// traços, com/sem DDI). Números BR sem DDI (≤11 dígitos) ganham 55 na frente.
function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return '+' + (digits.length <= 11 ? '55' + digits : digits);
}

// Versão do "Novo contato" para o app /atende: liberado para QUALQUER atendente
// (não só admin), grava na base unificada (marketing.contacts → alimenta CRM/
// Leads Hub) e já abre a conversa atribuída a quem criou. Redireciona p/ o chat.
export async function createContactFromAtende(formData: FormData): Promise<void> {
  const user = await requireUser();

  const name = String(formData.get('name') ?? '').trim();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase() || null;
  if (!name) throw new Error('nome obrigatório');
  const phone = toE164(phoneRaw);
  if (!phone || phone.replace(/\D/g, '').length < 12) {
    throw new Error('telefone inválido — use DDD + número (ex.: 15 99999-9999)');
  }

  // Dedup por telefone/whatsapp ou email.
  const dedupClauses = [eq(contacts.phone, phone), eq(contacts.whatsapp, phone)];
  if (email) dedupClauses.push(eq(contacts.email, email));
  const [existing] = await db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(or(...dedupClauses))
    .limit(1);

  let contactId: number;
  let contactName: string | null;
  if (existing) {
    contactId = existing.id;
    contactName = existing.name ?? name;
  } else {
    const [inserted] = await db
      .insert(contacts)
      .values({ name, phone, whatsapp: phone, email, source: 'atende', status: 'active' })
      .returning({ id: contacts.id });
    contactId = inserted.id;
    contactName = name;
  }

  const conversationId = await ensureConversation(phone, contactId, contactName, user.id);
  redirect(`/atende/c/${conversationId}`);
}

export type InboxContactDetail = {
  id: number;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  municipio: string | null;
  uf: string | null;
  source: string | null;
};

// Carrega os dados do contato de marketing vinculado a uma conversa (painel de
// contexto). Gated admin/gestor — o painel só enriquece quando há contactId.
export async function getInboxContact(contactId: number): Promise<InboxContactDetail | null> {
  const user = await requireUser();
  requireRole(user, [...ADMIN_ROLES]);
  const [c] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      municipio: contacts.municipio,
      uf: contacts.uf,
      source: contacts.source,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return c ?? null;
}

// Busca conversa WhatsApp pelo telefone normalizado; cria fria se não existir.
async function ensureConversation(
  normalizedPhone: string,
  contactId: number | null,
  contactName: string | null,
  userId: string,
): Promise<number> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.channel, 'whatsapp'), eq(conversations.waPhone, normalizedPhone)),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({
      channel: 'whatsapp',
      waPhone: normalizedPhone,
      contactName,
      contactId,
      status: 'open',
      assignedTo: userId,
      // Conversa fria: sem janela de 24h → composer exibe template picker.
      windowExpiresAt: null,
      unread: false,
    })
    .returning({ id: conversations.id });
  return created.id;
}
