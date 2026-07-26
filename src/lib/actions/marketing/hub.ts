'use server';

import { sql, eq, and, or, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { campaigns, templates, contacts, projects, conversations } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';

// Funil WhatsApp de ponta a ponta: audiência → enviado → entregue → lido →
// respondido → convertido (conversa ligada a campanha que virou oportunidade).
export type WaFunnel = {
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  converted: number;
};

export type HubStats = {
  contacts: number;
  projects: number;
  waCampaigns: number;
  waSent: number;
  emailCampaigns: number;
  emailOpenRate: number | null;
  openConversations: number;
  waFunnel: WaFunnel;
};

const EMPTY_FUNNEL: WaFunnel = {
  audience: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  converted: 0,
};

const EMPTY_STATS: HubStats = {
  contacts: 0,
  projects: 0,
  waCampaigns: 0,
  waSent: 0,
  emailCampaigns: 0,
  emailOpenRate: null,
  openConversations: 0,
  waFunnel: EMPTY_FUNNEL,
};

// Métricas agregadas pro Marketing Hub. Best-effort de verdade: se o DB tossir,
// retorna zeros em vez de derrubar a página inteira do marketing (stats são
// decorativas; projetos/campanhas são load-bearing).
export async function getHubStats(): Promise<HubStats> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  try {
    return await computeHubStats();
  } catch (err) {
    console.error('getHubStats falhou, degradando p/ zeros:', err);
    return EMPTY_STATS;
  }
}

async function computeHubStats(): Promise<HubStats> {
  const [contactsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts);
  const [projectsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);

  // Campanhas por canal (join no template pra saber o canal) + somatórios.
  const rows = await db
    .select({
      channel: templates.channel,
      n: sql<number>`count(*)::int`,
      recipients: sql<number>`coalesce(sum(${campaigns.totalRecipients}),0)::int`,
      sent: sql<number>`coalesce(sum(${campaigns.sentCount}),0)::int`,
      opens: sql<number>`coalesce(sum(${campaigns.openCount}),0)::int`,
      delivered: sql<number>`coalesce(sum(${campaigns.deliveredCount}),0)::int`,
      read: sql<number>`coalesce(sum(${campaigns.readCount}),0)::int`,
      replied: sql<number>`coalesce(sum(${campaigns.repliedCount}),0)::int`,
    })
    .from(campaigns)
    .leftJoin(templates, eq(campaigns.templateId, templates.id))
    .groupBy(templates.channel);

  const [convRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(eq(conversations.status, 'open'));

  // Convertido = conversa ligada a uma campanha cujo lead virou oportunidade:
  // ou a conversa aponta direto pra opp (opportunity_id), ou o contato de
  // marketing já foi promovido a crm.contacts (crm_contact_id — handoff FUNDEB
  // acontece depois, quando a opp chega em "Ganhou").
  const [convertedRow] = await db
    .select({ n: sql<number>`count(distinct ${conversations.id})::int` })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(
      and(
        isNotNull(conversations.campaignId),
        or(isNotNull(conversations.opportunityId), isNotNull(contacts.crmContactId)),
      ),
    );

  const wa = rows.find((r) => r.channel === 'whatsapp');
  const em = rows.find((r) => r.channel === 'email');
  const emailOpenRate =
    em && em.sent > 0 ? Math.round((em.opens / em.sent) * 100) : null;

  return {
    contacts: contactsRow?.n ?? 0,
    projects: projectsRow?.n ?? 0,
    waCampaigns: wa?.n ?? 0,
    waSent: wa?.sent ?? 0,
    emailCampaigns: em?.n ?? 0,
    emailOpenRate,
    openConversations: convRow?.n ?? 0,
    waFunnel: {
      audience: wa?.recipients ?? 0,
      sent: wa?.sent ?? 0,
      delivered: wa?.delivered ?? 0,
      read: wa?.read ?? 0,
      replied: wa?.replied ?? 0,
      converted: convertedRow?.n ?? 0,
    },
  };
}
