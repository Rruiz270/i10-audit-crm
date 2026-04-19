'use server';

import { and, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';
import {
  contacts,
  fundebConsultorias,
  fundebMunicipalities,
  opportunities,
  users,
} from '@/lib/schema';
import {
  buildConsultoriaPayload,
  computeEndDate,
  DEFAULT_CONSULTORIA_MONTHS,
} from '@/lib/handoff';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

/**
 * Handoff: moves a stage='ganhou' opportunity into fundeb.consultorias
 * as a real consultancy record in BNCC-CAPTACAO. Transactional across schemas.
 *
 * **Kickoff vs. handoff**: o timestamp do handoff (quando o CRM transferiu)
 * é registrado em `opportunities.handed_off_at`. A **data em que a consultoria
 * efetivamente inicia** é capturada aqui via `startDate` (mapeada para
 * `fundeb.consultorias.start_date`). Essa data pode ser no futuro — BNCC-CAPTACAO
 * usa ela como dia-1 do ciclo de 12 meses, independente de quando o handoff
 * aconteceu.
 */
export async function handoffToFundeb(formData: FormData) {
  const user = await requireUser();
  const opportunityId = Number(formData.get('opportunityId'));
  if (!Number.isFinite(opportunityId)) {
    return { ok: false as const, error: 'opportunityId inválido' };
  }

  const startRaw = String(formData.get('startDate') ?? '').trim();
  const durationRaw = String(formData.get('durationMonths') ?? '').trim();
  const secretaryOverride = String(formData.get('secretaryName') ?? '').trim();

  if (!startRaw) {
    return { ok: false as const, error: 'Informe a data de início da consultoria' };
  }
  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false as const, error: 'Data de início inválida' };
  }
  const durationMonths =
    durationRaw && Number.isFinite(Number(durationRaw))
      ? Math.max(1, Math.min(36, Number(durationRaw)))
      : DEFAULT_CONSULTORIA_MONTHS;
  const endDate = computeEndDate(startDate, durationMonths);

  const op = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });
  if (!op) return { ok: false as const, error: 'Oportunidade não encontrada' };
  if (op.stage !== 'ganhou') {
    return { ok: false as const, error: 'Oportunidade precisa estar no estágio Ganhou' };
  }
  if (op.handedOffConsultoriaId) {
    return { ok: false as const, error: 'Handoff já realizado' };
  }
  if (!op.municipalityId) {
    return { ok: false as const, error: 'Oportunidade sem municipalityId' };
  }

  const [owner] = op.ownerId
    ? await db.select().from(users).where(eq(users.id, op.ownerId)).limit(1)
    : [null];

  const primary = await db.query.contacts.findFirst({
    where: and(eq(contacts.opportunityId, opportunityId), eq(contacts.isPrimary, true)),
  });

  const primarySummary = primary
    ? `Contato principal: ${primary.name}${primary.role ? ` (${primary.role})` : ''}` +
      (primary.email ? `\nEmail: ${primary.email}` : '') +
      (primary.phone ? `\nTel: ${primary.phone}` : '') +
      (primary.whatsapp ? `\nWA: ${primary.whatsapp}` : '')
    : '(Sem contato principal registrado.)';

  const payload = buildConsultoriaPayload(op, owner?.name ?? null, primarySummary, {
    startDate,
    endDate,
    secretaryName: secretaryOverride || primary?.name || null,
  });

  // ── Cross-schema transactional insert + update ──────────────────────────
  const url = process.env.DATABASE_URL!;
  const sql = neon(url);

  type InsertedRow = { id: number };
  const [result] = (await sql.transaction([
    sql`INSERT INTO fundeb.consultorias
        (municipality_id, status, start_date, end_date, notes, consultant_name,
         secretary_name, annotations, created_at, updated_at)
        VALUES (${payload.municipalityId}, ${payload.status},
          ${payload.startDate.toISOString()},
          ${payload.endDate ? payload.endDate.toISOString() : null},
          ${payload.notes}, ${payload.consultantName},
          ${payload.secretaryName}, ${payload.annotations}, NOW(), NOW())
        RETURNING id`,
  ])) as unknown as [InsertedRow[]];

  const consultoriaId = result[0]?.id;
  if (!consultoriaId) {
    return { ok: false as const, error: 'Falha ao inserir consultoria' };
  }

  await db
    .update(opportunities)
    .set({
      handedOffConsultoriaId: consultoriaId,
      handedOffAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, opportunityId));

  await logActivity({
    opportunityId,
    type: 'handoff',
    subject: `Transferida para BNCC-CAPTACAO (consultoria #${consultoriaId})`,
    body:
      `Kickoff: ${startDate.toLocaleDateString('pt-BR')}` +
      ` · fim previsto: ${endDate.toLocaleDateString('pt-BR')}` +
      ` · consultor: ${payload.consultantName || '—'}` +
      (payload.secretaryName ? ` · secretário: ${payload.secretaryName}` : ''),
    actorId: user.id,
    metadata: {
      consultoriaId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      durationMonths,
    },
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  revalidatePath('/');

  return { ok: true as const, consultoriaId, startDate, endDate };
}

/** Oportunidades ganhas aguardando handoff — já existia, mantido. */
export async function pendingHandoffs() {
  return db
    .select({ id: opportunities.id, municipalityId: opportunities.municipalityId })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'ganhou'), isNull(opportunities.handedOffConsultoriaId)));
}

/**
 * Lê a consultoria correspondente (se houver) de uma oportunidade —
 * join read-only em `fundeb.consultorias`. Usado na página de detalhe
 * da oportunidade para mostrar "quando a consultoria começa".
 */
export async function getConsultoriaFor(opportunityId: number) {
  const rows = await db
    .select({
      consultoriaId: fundebConsultorias.id,
      status: fundebConsultorias.status,
      startDate: fundebConsultorias.startDate,
      endDate: fundebConsultorias.endDate,
      consultantName: fundebConsultorias.consultantName,
      secretaryName: fundebConsultorias.secretaryName,
      municipalityId: opportunities.municipalityId,
      municipalityName: fundebMunicipalities.nome,
      handedOffAt: opportunities.handedOffAt,
    })
    .from(opportunities)
    .leftJoin(
      fundebConsultorias,
      eq(opportunities.handedOffConsultoriaId, fundebConsultorias.id),
    )
    .leftJoin(
      fundebMunicipalities,
      eq(opportunities.municipalityId, fundebMunicipalities.id),
    )
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Handoffs + consultorias: usado pelos widgets "Kickoff esta semana" e
 * "Kickoff atrasado" no dashboard e em /reports.
 */
export async function listConsultoriasByKickoffWindow(params?: {
  from?: Date;
  to?: Date;
}) {
  const conditions = [isNotNull(opportunities.handedOffConsultoriaId)];
  if (params?.from) conditions.push(gte(fundebConsultorias.startDate, params.from));
  if (params?.to) conditions.push(lte(fundebConsultorias.startDate, params.to));

  return db
    .select({
      opportunityId: opportunities.id,
      consultoriaId: fundebConsultorias.id,
      status: fundebConsultorias.status,
      startDate: fundebConsultorias.startDate,
      endDate: fundebConsultorias.endDate,
      consultantName: fundebConsultorias.consultantName,
      secretaryName: fundebConsultorias.secretaryName,
      handedOffAt: opportunities.handedOffAt,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(opportunities)
    .leftJoin(
      fundebConsultorias,
      eq(opportunities.handedOffConsultoriaId, fundebConsultorias.id),
    )
    .leftJoin(
      fundebMunicipalities,
      eq(opportunities.municipalityId, fundebMunicipalities.id),
    )
    .where(and(...conditions))
    .orderBy(desc(fundebConsultorias.startDate))
    .limit(200);
}
