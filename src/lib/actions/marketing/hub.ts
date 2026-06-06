'use server';

import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { campaigns, templates, contacts, projects } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';

export type HubStats = {
  contacts: number;
  projects: number;
  waCampaigns: number;
  waSent: number;
  emailCampaigns: number;
  emailOpenRate: number | null;
};

// Métricas agregadas pro Marketing Hub. Tudo best-effort com counts simples.
export async function getHubStats(): Promise<HubStats> {
  const user = await requireUser();
  requireRole(user, ['admin']);

  const [contactsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts);
  const [projectsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(projects);

  // Campanhas por canal (join no template pra saber o canal) + somatórios.
  const rows = await db
    .select({
      channel: templates.channel,
      n: sql<number>`count(*)::int`,
      sent: sql<number>`coalesce(sum(${campaigns.sentCount}),0)::int`,
      opens: sql<number>`coalesce(sum(${campaigns.openCount}),0)::int`,
      delivered: sql<number>`coalesce(sum(${campaigns.deliveredCount}),0)::int`,
    })
    .from(campaigns)
    .leftJoin(templates, eq(campaigns.templateId, templates.id))
    .groupBy(templates.channel);

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
  };
}
