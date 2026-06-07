'use server';

import { eq, and, sql, asc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parse } from 'csv-parse/sync';
import { db } from '@/lib/db';
import {
  projects,
  contacts as marketingContacts,
  crmBridgeLog,
} from '@/lib/schema-marketing';
import {
  users as crmUsers,
  opportunities,
  contacts as crmContacts,
  fundebMunicipalities,
  activities,
} from '@/lib/schema';
import { requireUser, requireRole } from '@/lib/session';
import { autoTagOpportunity } from '@/lib/actions/tags';

// ─── importAttendanceCsv ──────────────────────────────────────────────────
// Sobe CSV de attendance (Google Meet/Zoom/Teams export) e:
//   1. Extrai emails da coluna "email" (case-insensitive, aceita variações)
//   2. Match contra marketing.contacts por email
//   3. Adiciona tag webinar_attended_<project_slug> aos atributos
//   4. Cria crm.opportunities (stage=novo, source=webinar_attended_*)
//   5. Auto-assign round-robin entre crm.users com role=consultor,is_active=true
//   6. Cria crm.contacts (primary) linkado ao opp
//   7. Loga em marketing.crm_bridge_log pra auditoria
//
// Idempotente: se já existe opp com source=webinar_attended_* pra mesmo
// crm.contacts.email, NÃO cria duplicata. Apenas re-tag se necessário.

type AttendanceRow = Record<string, string>;

function findEmailColumn(rowKeys: string[]): string | null {
  // Busca coluna "email" — aceita variações: Email, EMAIL, e-mail, "User Email"
  const candidates = rowKeys.filter((k) => /e[\s-]*mail/i.test(k));
  if (candidates.length === 0) return null;
  // Preferir match exato "email" se existir
  const exact = candidates.find((k) => k.toLowerCase() === 'email');
  return exact ?? candidates[0];
}

function findIbgeColumn(rowKeys: string[]): string | null {
  return rowKeys.find((k) => /ibge|cod_municipio|codigo_ibge/i.test(k)) ?? null;
}

export async function importAttendanceCsv(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const projectId = Number(formData.get('projectId'));
  const eventLabel = String(formData.get('eventLabel') ?? '').trim() || 'webinar';
  const csvFile = formData.get('csv') as File | null;

  if (!projectId || !csvFile) throw new Error('projectId e csv obrigatórios');

  const project = (
    await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  )[0];
  if (!project) throw new Error('project not found');

  const csvText = await csvFile.text();
  let rows: AttendanceRow[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as AttendanceRow[];
  } catch (e) {
    throw new Error(`CSV inválido: ${e instanceof Error ? e.message : 'parse error'}`);
  }
  if (rows.length === 0) throw new Error('CSV vazio');

  const emailCol = findEmailColumn(Object.keys(rows[0] ?? {}));
  if (!emailCol) throw new Error('CSV sem coluna de email reconhecida');
  const ibgeCol = findIbgeColumn(Object.keys(rows[0] ?? {}));

  // Coletar emails únicos
  const attendees = new Map<string, AttendanceRow>();
  for (const row of rows) {
    const email = (row[emailCol] ?? '').trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (!attendees.has(email)) attendees.set(email, row);
    }
  }

  if (attendees.size === 0) throw new Error('Nenhum email válido encontrado no CSV');

  const attendedTag = `webinar_attended_${project.slug}`;
  const attendedSource = `webinar_attended_${project.slug}`;

  // Carregar consultores ativos pra round-robin
  const consultores = await db
    .select({ id: crmUsers.id })
    .from(crmUsers)
    .where(and(eq(crmUsers.role, 'consultor'), eq(crmUsers.isActive, true)))
    .orderBy(asc(crmUsers.id));

  if (consultores.length === 0) {
    throw new Error('Nenhum consultor ativo no CRM — não posso atribuir leads');
  }

  let robinIdx = 0;
  let oppCreated = 0;
  let alreadyExisted = 0;
  let unmatched = 0;
  let tagged = 0;

  for (const [email, row] of attendees) {
    // Match em marketing.contacts
    const mc = await db
      .select()
      .from(marketingContacts)
      .where(eq(marketingContacts.email, email))
      .limit(1);
    if (!mc[0]) {
      unmatched += 1;
      continue;
    }
    const contact = mc[0];

    // Tag no marketing.contacts
    const attrs = (contact.attributes ?? {}) as Record<string, unknown>;
    const tags = Array.isArray(attrs.tags) ? (attrs.tags as string[]) : [];
    if (!tags.includes(attendedTag)) {
      await db
        .update(marketingContacts)
        .set({
          attributes: { ...attrs, tags: [...tags, attendedTag] },
          updatedAt: new Date(),
        })
        .where(eq(marketingContacts.id, contact.id));
      tagged += 1;
    }

    // Resolver municipalityId no fundeb (preferir IBGE do CSV, fallback contact.ibge)
    let municipalityId: number | null = null;
    const ibgeFromCsv = ibgeCol ? (row[ibgeCol] ?? '').trim() : '';
    const ibge = ibgeFromCsv || contact.ibge || '';
    if (ibge) {
      const muni = await db
        .select({ id: fundebMunicipalities.id })
        .from(fundebMunicipalities)
        .where(eq(fundebMunicipalities.codigoIbge, ibge.slice(0, 7)))
        .limit(1);
      municipalityId = muni[0]?.id ?? null;
    }

    // Idempotência: já existe opp com mesmo source + mesmo contact email?
    const existingContact = await db
      .select({ oppId: crmContacts.opportunityId })
      .from(crmContacts)
      .innerJoin(opportunities, eq(crmContacts.opportunityId, opportunities.id))
      .where(
        and(
          eq(crmContacts.email, email),
          eq(opportunities.source, attendedSource),
        ),
      )
      .limit(1);

    if (existingContact[0]) {
      alreadyExisted += 1;
      await db.insert(crmBridgeLog).values({
        triggerType: 'attendance_csv',
        contactId: contact.id,
        crmAction: 'no_action',
        crmRefs: { existingOppId: existingContact[0].oppId },
        notes: `Already had opp from previous attendance import for ${email}`,
      });
      continue;
    }

    // Criar opp + contact
    const ownerId = consultores[robinIdx % consultores.length].id;
    robinIdx += 1;

    const [newOpp] = await db
      .insert(opportunities)
      .values({
        municipalityId,
        ownerId,
        stage: 'novo',
        source: attendedSource,
        notes: `Lead gerado a partir de presença no ${eventLabel} (projeto ${project.slug})`,
      })
      .returning({ id: opportunities.id });

    await db.insert(crmContacts).values({
      opportunityId: newOpp.id,
      name: contact.name ?? email.split('@')[0],
      email,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      role: contact.role,
      isPrimary: true,
    });

    // Sincronizar marketing.contacts.crmContactId — pega o id do contact que acabamos de criar
    const newCrmContact = await db
      .select({ id: crmContacts.id })
      .from(crmContacts)
      .where(eq(crmContacts.opportunityId, newOpp.id))
      .limit(1);
    if (newCrmContact[0]) {
      await db
        .update(marketingContacts)
        .set({ crmContactId: newCrmContact[0].id })
        .where(eq(marketingContacts.id, contact.id));
    }

    // Atividade no histórico do opp
    await db.insert(activities).values({
      opportunityId: newOpp.id,
      type: 'webinar_attendance',
      subject: `Compareceu ${eventLabel}`,
      body: `Lead criado automaticamente via attendance import (CSV).\nEmail: ${email}\nProjeto marketing: ${project.name}`,
      metadata: {
        source: attendedSource,
        marketingContactId: contact.id,
        importedBy: user.id,
      },
    });

    // Auto-tag por origem (resiliente).
    await autoTagOpportunity(newOpp.id, ['Webinar FUNDEB'], { actorId: user.id });

    // Audit
    await db.insert(crmBridgeLog).values({
      triggerType: 'attendance_csv',
      contactId: contact.id,
      crmAction: 'opportunity_created',
      crmRefs: {
        opportunityId: newOpp.id,
        ownerId,
        municipalityId,
      },
    });

    oppCreated += 1;
  }

  // Pages que mostram opps precisam revalidar
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  revalidatePath('/leads');
  revalidatePath(`/marketing/${projectId}`);

  redirect(
    `/marketing/${projectId}/attendance?created=${oppCreated}&existed=${alreadyExisted}&unmatched=${unmatched}&tagged=${tagged}`,
  );
}
