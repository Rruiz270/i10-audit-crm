'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  activities,
  contacts,
  meetings,
  opportunities,
  users,
  fundebMunicipalities,
} from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { canAdvance } from '@/lib/qualification';
import { logActivity } from '@/lib/activity';
import type { StageKey } from '@/lib/pipeline';
import { STAGES_BY_KEY } from '@/lib/pipeline';
import {
  isValidLostReason,
  LOST_REASONS_BY_CODE,
  type LostReasonCode,
} from '@/lib/lost-reasons';

const createSchema = z.object({
  municipalityId: z.coerce.number().int().positive().optional(),
  source: z.string().trim().max(120).optional().or(z.literal('')),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
});

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  municipalityId: z.coerce.number().int().positive().optional().or(z.literal('')),
  ownerId: z.string().trim().optional().or(z.literal('')),
  source: z.string().trim().max(120).optional().or(z.literal('')),
  estimatedValue: z.coerce.number().nonnegative().optional().or(z.literal('')),
  closeDate: z.string().optional().or(z.literal('')),
  contractSigned: z.string().optional(),
  contractNotes: z.string().trim().max(5000).optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
  lostReason: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function checkDuplicateByMunicipality(municipalityId: number) {
  // Retorna oportunidades ativas (não terminais, não arquivadas) para o mesmo município.
  // É a funcionalidade "Duplicate detection" do Salesforce / Pipedrive.
  const rows = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      ownerId: opportunities.ownerId,
      ownerName: users.name,
      createdAt: opportunities.createdAt,
    })
    .from(opportunities)
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(
      and(
        eq(opportunities.municipalityId, municipalityId),
        inArray(opportunities.stage, [
          'novo',
          'contato_inicial',
          'diagnostico_enviado',
          'follow_up',
          'reuniao_auditoria',
          'negociacao',
        ]),
      ),
    )
    .limit(5);
  return rows;
}

export async function createOpportunity(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos');
  }
  const data = parsed.data;

  // Duplicate detection — bloqueia a não ser que o form explicite allow_duplicate=on.
  const allowDuplicate =
    formData.get('allowDuplicate') === 'on' || formData.get('allowDuplicate') === 'true';
  if (data.municipalityId && !allowDuplicate) {
    const dupes = await checkDuplicateByMunicipality(data.municipalityId);
    if (dupes.length > 0) {
      const ids = dupes.map((d) => `#${d.id}`).join(', ');
      throw new Error(
        `Já existe oportunidade ativa para este município (${ids}). Para forçar, marque "Permitir duplicada".`,
      );
    }
  }

  const [created] = await db
    .insert(opportunities)
    .values({
      municipalityId: data.municipalityId ?? null,
      ownerId: user.id,
      stage: 'novo',
      source: data.source || null,
      estimatedValue: data.estimatedValue ?? null,
      notes: data.notes || null,
    })
    .returning({ id: opportunities.id });

  await logActivity({
    opportunityId: created.id,
    type: 'note',
    subject: 'Oportunidade criada',
    actorId: user.id,
  });

  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  redirect(`/opportunities/${created.id}`);
}

export async function setOpportunityTags(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  const tagsCsv = String(formData.get('tags') ?? '');
  const list = tagsCsv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  await db.update(opportunities).set({ tags: list, updatedAt: new Date() }).where(eq(opportunities.id, id));
  await logActivity({
    opportunityId: id,
    type: 'tags_updated',
    subject: 'Tags atualizadas',
    body: list.join(', ') || '(nenhuma)',
    actorId: user.id,
    metadata: { tags: list },
  });
  revalidatePath(`/opportunities/${id}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const, tags: list };
}

export async function bulkReassign(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const newOwner = String(formData.get('ownerId') ?? '').trim();
  const idsRaw = String(formData.get('ids') ?? '');
  const ids = idsRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length || !newOwner) {
    return { ok: false as const, error: 'Informe ownerId e pelo menos 1 ID' };
  }
  await db
    .update(opportunities)
    .set({ ownerId: newOwner, updatedAt: new Date() })
    .where(inArray(opportunities.id, ids));

  for (const id of ids) {
    await logActivity({
      opportunityId: id,
      type: 'bulk_reassign',
      subject: 'Reatribuição em massa',
      actorId: user.id,
      metadata: { newOwnerId: newOwner, batchSize: ids.length },
    });
  }

  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const, count: ids.length };
}

export async function updateOpportunity(formData: FormData) {
  const user = await requireUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { id, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (rest.municipalityId !== undefined && rest.municipalityId !== '')
    patch.municipalityId = Number(rest.municipalityId);
  if (rest.ownerId !== undefined && rest.ownerId !== '') patch.ownerId = rest.ownerId;
  if (rest.source !== undefined) patch.source = rest.source || null;
  if (rest.estimatedValue !== undefined && rest.estimatedValue !== '')
    patch.estimatedValue = Number(rest.estimatedValue);
  if (rest.closeDate !== undefined && rest.closeDate !== '')
    patch.closeDate = new Date(rest.closeDate);
  if (rest.contractSigned !== undefined)
    patch.contractSigned = rest.contractSigned === 'on' || rest.contractSigned === 'true';
  if (rest.contractNotes !== undefined) patch.contractNotes = rest.contractNotes || null;
  if (rest.notes !== undefined) patch.notes = rest.notes || null;
  if (rest.lostReason !== undefined) patch.lostReason = rest.lostReason || null;

  await db.update(opportunities).set(patch).where(eq(opportunities.id, id));

  await logActivity({
    opportunityId: id,
    type: 'note',
    subject: 'Oportunidade editada',
    actorId: user.id,
  });

  revalidatePath(`/opportunities/${id}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const };
}

export async function deleteOpportunity(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return { ok: false as const, error: 'ID inválido' };
  if (user.role !== 'admin') {
    return { ok: false as const, error: 'Apenas admin pode excluir.' };
  }
  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  redirect('/opportunities');
}

export async function deleteOpportunityById(id: number) {
  const user = await requireUser();
  if (user.role !== 'admin') {
    return { ok: false as const, error: 'Apenas admin pode excluir.' };
  }
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false as const, error: 'ID inválido' };
  }
  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const };
}

export async function bulkDeleteOpportunities(ids: number[]) {
  const user = await requireUser();
  if (user.role !== 'admin') {
    return { ok: false as const, error: 'Apenas admin pode excluir.' };
  }
  const valid = ids.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) {
    return { ok: false as const, error: 'Nenhum ID válido' };
  }
  await db.delete(opportunities).where(inArray(opportunities.id, valid));
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const, count: valid.length };
}

export async function changeStage(input: {
  opportunityId: number;
  toStage: StageKey;
  lostReason?: string;
  lostReasonCode?: string;
}) {
  const user = await requireUser();
  const { opportunityId, toStage, lostReason, lostReasonCode } = input;

  if (!STAGES_BY_KEY[toStage]) {
    return { ok: false as const, error: 'Estágio desconhecido' };
  }

  const op = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });
  if (!op) return { ok: false as const, error: 'Oportunidade não encontrada' };

  const primaryContact = await db.query.contacts.findFirst({
    where: and(eq(contacts.opportunityId, opportunityId), eq(contacts.isPrimary, true)),
  });

  const guard = canAdvance(
    {
      stage: op.stage as StageKey,
      municipalityId: op.municipalityId ?? null,
      estimatedValue: op.estimatedValue ?? null,
      closeDate: op.closeDate ?? null,
      primaryContactId: primaryContact?.id ?? null,
    },
    toStage,
  );

  if (!guard.ok) {
    return { ok: false as const, error: guard.reason, missing: guard.missing };
  }

  if (toStage === 'perdido') {
    if (!isValidLostReason(lostReasonCode)) {
      return {
        ok: false as const,
        error: 'Selecione um motivo de perda do picklist',
        missing: ['lostReasonCode'],
      };
    }
    // "other" exige texto livre detalhando
    if (lostReasonCode === 'other' && !lostReason?.trim()) {
      return {
        ok: false as const,
        error: 'Para "Outro", descreva o motivo no campo texto',
        missing: ['lostReason'],
      };
    }
  }

  const now = new Date();
  const patch: Record<string, unknown> = {
    stage: toStage,
    stageUpdatedAt: now,
    updatedAt: now,
  };
  if (toStage === 'ganhou') patch.wonAt = now;
  if (toStage === 'perdido') {
    patch.lostAt = now;
    patch.lostReasonCode = lostReasonCode;
    patch.lostReason = lostReason?.trim() || LOST_REASONS_BY_CODE[lostReasonCode as LostReasonCode]?.label;
  }

  await db.update(opportunities).set(patch).where(eq(opportunities.id, opportunityId));

  await logActivity({
    opportunityId,
    type: 'stage_change',
    subject: `${STAGES_BY_KEY[op.stage as StageKey]?.label ?? op.stage} → ${STAGES_BY_KEY[toStage].label}`,
    body: lostReason ?? undefined,
    actorId: user.id,
    metadata: { from: op.stage, to: toStage, lostReasonCode: lostReasonCode ?? null },
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const };
}

export async function changeStageAction(formData: FormData) {
  const opportunityId = Number(formData.get('opportunityId'));
  const toStage = String(formData.get('toStage')) as StageKey;
  const lostReason = formData.get('lostReason')?.toString();
  const lostReasonCode = formData.get('lostReasonCode')?.toString();
  const res = await changeStage({ opportunityId, toStage, lostReason, lostReasonCode });
  return res;
}

export async function listOpportunities(filter?: {
  stage?: StageKey;
  ownerId?: string;
}) {
  const conditions = [];
  if (filter?.stage) conditions.push(eq(opportunities.stage, filter.stage));
  if (filter?.ownerId) conditions.push(eq(opportunities.ownerId, filter.ownerId));

  return db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      source: opportunities.source,
      estimatedValue: opportunities.estimatedValue,
      closeDate: opportunities.closeDate,
      stageUpdatedAt: opportunities.stageUpdatedAt,
      lastActivityAt: opportunities.lastActivityAt,
      createdAt: opportunities.createdAt,
      tags: opportunities.tags,
      municipalityId: opportunities.municipalityId,
      municipalityName: fundebMunicipalities.nome,
      ownerId: opportunities.ownerId,
      ownerName: users.name,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(opportunities.createdAt));
}

export async function getOpportunity(id: number) {
  const op = await db
    .select({
      o: opportunities,
      municipalityName: fundebMunicipalities.nome,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(eq(opportunities.id, id))
    .limit(1);

  if (!op[0]) return null;

  const [contactRows, activityRows, meetingRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.opportunityId, id)),
    db
      .select()
      .from(activities)
      .where(eq(activities.opportunityId, id))
      .orderBy(desc(activities.occurredAt))
      .limit(200),
    db
      .select()
      .from(meetings)
      .where(eq(meetings.opportunityId, id))
      .orderBy(desc(meetings.scheduledAt))
      .limit(100),
  ]);

  return {
    ...op[0].o,
    municipalityName: op[0].municipalityName,
    ownerName: op[0].ownerName,
    ownerEmail: op[0].ownerEmail,
    contacts: contactRows,
    activities: activityRows,
    meetings: meetingRows,
  };
}

export async function searchMunicipalities(q: string, limit = 20) {
  const query = q.trim();
  if (!query) return [];
  // Simple case-insensitive prefix match.
  return db
    .select({ id: fundebMunicipalities.id, nome: fundebMunicipalities.nome })
    .from(fundebMunicipalities)
    .where(eq(fundebMunicipalities.nome, query))
    .limit(limit);
}

export async function listUsersForAssignment() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.isActive, true));
}

export async function reassignOpportunity(formData: FormData) {
  const user = await requireUser();
  requireRoleCheck(user.role);
  const id = Number(formData.get('id'));
  const ownerId = String(formData.get('ownerId'));
  await db.update(opportunities).set({ ownerId, updatedAt: new Date() }).where(eq(opportunities.id, id));
  await logActivity({
    opportunityId: id,
    type: 'note',
    subject: 'Reatribuída',
    actorId: user.id,
    metadata: { newOwnerId: ownerId },
  });
  revalidatePath(`/opportunities/${id}`);
  return { ok: true as const };
}

function requireRoleCheck(role: string) {
  if (!['admin', 'gestor'].includes(role)) {
    throw new Error('FORBIDDEN');
  }
}

export async function opportunitiesByStage(filter?: { ownerId?: string }) {
  const rows = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      closeDate: opportunities.closeDate,
      stageUpdatedAt: opportunities.stageUpdatedAt,
      lastActivityAt: opportunities.lastActivityAt,
      tags: opportunities.tags,
      municipalityId: opportunities.municipalityId,
      municipalityName: fundebMunicipalities.nome,
      ownerId: opportunities.ownerId,
      ownerName: users.name,
      handedOffConsultoriaId: opportunities.handedOffConsultoriaId,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(
      and(
        inArray(opportunities.stage, [
          'novo',
          'contato_inicial',
          'diagnostico_enviado',
          'follow_up',
          'reuniao_auditoria',
          'negociacao',
          'ganhou',
        ]),
        filter?.ownerId ? eq(opportunities.ownerId, filter.ownerId) : undefined,
      ),
    );
  return rows;
}
