'use server';

import { eq, desc, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  campaigns,
  audiences,
  templates,
  contacts,
  sends,
} from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { launchCampaignCore } from '@/lib/marketing/launch';

export async function listCampaigns(projectId: number) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.projectId, projectId))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(id: number) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCampaign(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const projectId = Number(formData.get('projectId'));
  const audienceId = Number(formData.get('audienceId'));
  const templateId = Number(formData.get('templateId'));
  const name = String(formData.get('name') ?? '').trim();
  const provider = String(formData.get('provider') ?? '').trim() || null;
  const ratePerMinute = Number(formData.get('ratePerMinute') ?? 30);

  if (!projectId || !audienceId || !templateId || !name) {
    throw new Error('Todos os campos são obrigatórios');
  }

  const aud = await db.select().from(audiences).where(eq(audiences.id, audienceId)).limit(1);
  const tpl = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!aud[0] || aud[0].projectId !== projectId) throw new Error('audience inválida');
  if (!tpl[0] || tpl[0].projectId !== projectId) throw new Error('template inválido');

  const totalRecipients = aud[0].contactCount;
  const [created] = await db
    .insert(campaigns)
    .values({
      projectId,
      audienceId,
      templateId,
      name,
      provider,
      ratePerMinute,
      totalRecipients,
      status: 'draft',
      createdBy: user.id,
    })
    .returning({ id: campaigns.id });

  revalidatePath(`/marketing/${projectId}`);
  revalidatePath(`/marketing/${projectId}/campaigns`);
  redirect(`/marketing/${projectId}/campaigns/${created.id}`);
}

// ─── Launch — gera 1 send + 1 queue job por contato da audience ──────────
export async function launchCampaign(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const campaignId = Number(formData.get('campaignId'));
  const dryRunOnly = String(formData.get('dryRun') ?? '') === '1';
  const limitInput = Number(formData.get('limit') ?? 0);
  const limit = limitInput > 0 ? limitInput : Infinity;

  if (!campaignId) throw new Error('campaignId obrigatório');

  const c = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c[0]) throw new Error('campaign não encontrada');
  const camp = c[0];

  // A mecânica do disparo vive em lib/marketing/launch (o cron de campanhas
  // agendadas usa a mesma função, sem sessão). Aqui fica só auth + navegação.
  const result = await launchCampaignCore(campaignId, {
    dryRun: dryRunOnly,
    limit: limitInput > 0 ? limitInput : undefined,
  });

  revalidatePath(`/marketing/${camp.projectId}/campaigns/${campaignId}`);
  redirect(
    dryRunOnly
      ? `/marketing/${camp.projectId}/campaigns/${campaignId}?dryrun=${result.sendsCreated}`
      : `/marketing/${camp.projectId}/campaigns/${campaignId}?launched=${result.sendsCreated}`,
  );
}

export async function pauseCampaign(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const campaignId = Number(formData.get('campaignId'));
  await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, campaignId));
  revalidatePath(`/marketing/${campaignId}`);
}

export async function getCampaignStats(campaignId: number) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const c = await db
    .select({
      id: campaigns.id,
      status: campaigns.status,
      totalRecipients: campaigns.totalRecipients,
      sentCount: campaigns.sentCount,
      deliveredCount: campaigns.deliveredCount,
      openCount: campaigns.openCount,
      clickCount: campaigns.clickCount,
      bounceCount: campaigns.bounceCount,
      unsubscribeCount: campaigns.unsubscribeCount,
      complaintCount: campaigns.complaintCount,
      startedAt: campaigns.startedAt,
      completedAt: campaigns.completedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!c[0]) return null;
  // Status real dos sends
  const sendStatusCounts = await db
    .select({
      status: sends.status,
      count: sql<number>`count(*)::int`,
    })
    .from(sends)
    .where(eq(sends.campaignId, campaignId))
    .groupBy(sends.status);

  return {
    ...c[0],
    sendsByStatus: Object.fromEntries(
      sendStatusCounts.map((r) => [r.status, r.count]),
    ),
  };
}

// Lista os destinatários que deram bounce (clicável no dashboard da campanha)
export async function getBouncedRecipients(campaignId: number) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  return db
    .select({
      email: sends.toEmail,
      reason: sends.errorMessage,
      municipio: contacts.municipio,
    })
    .from(sends)
    .leftJoin(contacts, eq(sends.contactId, contacts.id))
    .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'bounced')))
    .orderBy(desc(sends.errorMessage), contacts.municipio);
}
