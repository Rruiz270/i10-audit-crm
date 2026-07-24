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
  listMembers,
  sends,
} from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { generateTrackingToken } from '@/lib/marketing/template-engine';
import { batchIsSuppressed } from '@/lib/marketing/suppression';
import { bulkEnqueueJobs } from '@/lib/marketing/queue';

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
  if (camp.status === 'sent' || camp.status === 'sending') {
    throw new Error(`campaign já está ${camp.status}`);
  }

  // Canal da campanha = canal do template (email | whatsapp). Define como
  // filtramos elegíveis, qual destino gravamos e qual job enfileiramos.
  const tplRow = await db
    .select({ channel: templates.channel })
    .from(templates)
    .where(eq(templates.id, camp.templateId))
    .limit(1);
  const isWhatsApp = tplRow[0]?.channel === 'whatsapp';

  // Carregar contacts da audience (inclui phone/whatsapp p/ o canal WhatsApp)
  const audienceContacts = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      name: contacts.name,
      ibge: contacts.ibge,
      municipio: contacts.municipio,
      uf: contacts.uf,
      attributes: contacts.attributes,
      status: contacts.status,
    })
    .from(listMembers)
    .innerJoin(contacts, eq(listMembers.contactId, contacts.id))
    .where(
      and(eq(listMembers.audienceId, camp.audienceId), eq(contacts.status, 'active')),
    );

  if (audienceContacts.length === 0) {
    throw new Error('audience vazia ou sem contatos ativos');
  }

  // Destino + supressão por canal
  const destOf = (c: (typeof audienceContacts)[number]) =>
    isWhatsApp ? c.whatsapp ?? c.phone ?? null : c.email ?? null;
  const dests = audienceContacts.map(destOf).filter((d): d is string => Boolean(d));
  const suppressedSet = await batchIsSuppressed(dests, isWhatsApp ? 'whatsapp' : 'email');
  const eligible = audienceContacts.filter((c) => {
    const d = destOf(c);
    return d && !suppressedSet.has(d);
  });

  // Aplicar limit (pra dry-run)
  const final = eligible.slice(0, limit);

  if (dryRunOnly) {
    // Para dry-run via UI, gravamos snapshot na campanha em "notes-like"
    // metadata via update (não mexe no status). Em script use a função inferior.
    revalidatePath(`/marketing/${camp.projectId}/campaigns/${campaignId}`);
    redirect(
      `/marketing/${camp.projectId}/campaigns/${campaignId}?dryrun=${final.length}`,
    );
  }

  // Marcar campanha como sending
  await db
    .update(campaigns)
    .set({ status: 'sending', startedAt: new Date(), totalRecipients: final.length })
    .where(eq(campaigns.id, campaignId));

  // Inserir sends + jobs em chunks
  const chunkSize = 500;
  let sendsCreated = 0;
  for (let i = 0; i < final.length; i += chunkSize) {
    const chunk = final.slice(i, i + chunkSize);
    const insertedSends = await db
      .insert(sends)
      .values(
        chunk.map((c) => {
          // Merge vars = atributos do contact + campos canônicos
          const mergeVars: Record<string, unknown> = {
            ...((c.attributes ?? {}) as Record<string, unknown>),
            nome: c.name ?? ((c.attributes as Record<string, unknown> | null)?.nome ?? ''),
            ibge: c.ibge,
            municipio: c.municipio,
            uf: c.uf,
            email: c.email,
            // link_inscricao computed se houver IBGE
            link_inscricao: c.ibge
              ? `https://webinar-fundeb.institutoi10.org.br/?ibge=${c.ibge}`
              : 'https://institutoi10.org.br',
          };
          return {
            campaignId,
            contactId: c.id,
            toEmail: isWhatsApp ? null : c.email,
            toPhone: isWhatsApp ? c.whatsapp ?? c.phone : null,
            mergeVars,
            status: 'queued',
            trackingToken: generateTrackingToken(),
          };
        }),
      )
      .returning({ id: sends.id });
    sendsCreated += insertedSends.length;

    // Enfileirar jobs com staggered runAt baseado em ratePerMinute
    // (espalha sends ao longo do tempo pra respeitar rate limit do provider)
    const jobsToEnqueue = insertedSends.map((s, idx) => {
      const offsetMs = ((i + idx) / camp.ratePerMinute!) * 60_000;
      return {
        type: (isWhatsApp ? 'send_whatsapp' : 'send_email') as 'send_whatsapp' | 'send_email',
        payload: { sendId: s.id },
        runAt: new Date(Date.now() + offsetMs),
        rateBucket: isWhatsApp ? camp.provider ?? 'twilio' : camp.provider ?? 'brevo',
      };
    });
    await bulkEnqueueJobs(jobsToEnqueue);
  }

  revalidatePath(`/marketing/${camp.projectId}/campaigns/${campaignId}`);
  redirect(`/marketing/${camp.projectId}/campaigns/${campaignId}?launched=${sendsCreated}`);
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
      readCount: campaigns.readCount,
      repliedCount: campaigns.repliedCount,
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
