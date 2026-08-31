import { randomBytes } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { neon } from '@neondatabase/serverless';
import { db } from './db';
import { contacts, opportunities, proposalEvents, proposals, tasks, users } from './schema';
import { logActivity } from './activity';
import { sendPushToUsers } from './push';
import { planAcceptance } from './proposal-acceptance';
import {
  buildConsultoriaPayload,
  computeEndDate,
  DEFAULT_CONSULTORIA_MONTHS,
} from './handoff';
import { PRODUCT_POSVENDA, type Product } from './products';

// ─── Proposta pública: tracking + aceite digital ────────────────────────────
// A página /proposta/[propId]?t=<token> é aberta pelo cliente (prefeitura) sem
// login. Aqui vive tudo que ela pode fazer: registrar visualização, acumular
// tempo de leitura (beacon) e aceitar digitalmente — que marca contractSigned,
// move a opp para Ganhou e dispara o handoff FUNDEB → BNCC-CAPTACAO.

/** Re-notifica o vendedor se o cliente voltar à proposta após este intervalo. */
const VIEW_RENOTIFY_MS = 4 * 60 * 60 * 1000;
/** Tempo de leitura acumulado que sinaliza "momento de interesse". */
const READ_INTEREST_SECONDS = 90;

export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Garante que a proposta tem token público (lazy-backfill para antigas). */
export async function ensureProposalPublicToken(proposalId: number): Promise<string> {
  const [p] = await db
    .select({ token: proposals.publicToken })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (p?.token) return p.token;
  const token = generatePublicToken();
  await db
    .update(proposals)
    .set({ publicToken: token, updatedAt: new Date() })
    .where(and(eq(proposals.id, proposalId), sql`${proposals.publicToken} IS NULL`));
  // Corrida benigna: se outro request gravou antes, lê o vencedor.
  const [after] = await db
    .select({ token: proposals.publicToken })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  return after?.token ?? token;
}

/** Valida id+token e devolve a proposta pública (ou null). */
export async function getPublicProposal(proposalId: number, token: string) {
  if (!Number.isFinite(proposalId) || !token || token.length < 16) return null;
  const [p] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.publicToken, token)))
    .limit(1);
  return p ?? null;
}

async function notifyOwner(opportunityId: number, title: string, body: string) {
  const [op] = await db
    .select({ ownerId: opportunities.ownerId })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  if (!op?.ownerId) return;
  await sendPushToUsers([op.ownerId], {
    title,
    body,
    url: `/opportunities/${opportunityId}`,
    tag: `proposal-${opportunityId}`,
  }).catch(() => {});
}

/**
 * Registra uma visualização da página pública. Primeira vez (ou retorno após
 * VIEW_RENOTIFY_MS) → atividade na timeline + push pro dono da opp.
 */
export async function registerProposalView(
  p: { id: number; opportunityId: number; number: string; version: number },
  userAgent: string | null,
): Promise<void> {
  const [lastView] = await db
    .select({ createdAt: proposalEvents.createdAt })
    .from(proposalEvents)
    .where(and(eq(proposalEvents.proposalId, p.id), eq(proposalEvents.kind, 'view')))
    .orderBy(desc(proposalEvents.createdAt))
    .limit(1);

  await db.insert(proposalEvents).values({
    proposalId: p.id,
    kind: 'view',
    userAgent: userAgent?.slice(0, 500) ?? null,
  });

  const isFirst = !lastView;
  const isReturn =
    !!lastView?.createdAt && Date.now() - lastView.createdAt.getTime() > VIEW_RENOTIFY_MS;
  if (!isFirst && !isReturn) return;

  const label = `Proposta ${p.number} v${p.version}`;
  if (isFirst) {
    await logActivity({
      opportunityId: p.opportunityId,
      type: 'proposal',
      subject: `${label} visualizada pelo cliente`,
      metadata: { proposalId: p.id, event: 'first_view' },
    });
  }
  await notifyOwner(
    p.opportunityId,
    isFirst ? '👀 Proposta aberta pelo cliente' : '👀 Cliente voltou à proposta',
    `${label} está sendo visualizada agora.`,
  );
}

/**
 * Acumula tempo de leitura de uma sessão de navegação (upsert por sessionKey).
 * Ao cruzar READ_INTEREST_SECONDS totais pela primeira vez, marca o "momento
 * de interesse": atividade + push pro vendedor.
 */
export async function trackReadSeconds(
  p: { id: number; opportunityId: number; number: string; version: number },
  sessionKey: string,
  seconds: number,
  userAgent: string | null,
): Promise<void> {
  if (!sessionKey || sessionKey.length > 64) return;
  const clamped = Math.max(0, Math.min(2 * 60 * 60, Math.round(seconds)));
  if (!clamped) return;

  const [totalBefore] = await db
    .select({ s: sql<number>`coalesce(sum(${proposalEvents.readSeconds}), 0)::int` })
    .from(proposalEvents)
    .where(and(eq(proposalEvents.proposalId, p.id), eq(proposalEvents.kind, 'read')));

  const [existing] = await db
    .select({ id: proposalEvents.id, readSeconds: proposalEvents.readSeconds })
    .from(proposalEvents)
    .where(
      and(
        eq(proposalEvents.proposalId, p.id),
        eq(proposalEvents.kind, 'read'),
        eq(proposalEvents.sessionKey, sessionKey),
      ),
    )
    .limit(1);

  if (existing) {
    // Beacons trazem o acumulado da sessão — guarda sempre o maior.
    if (clamped > (existing.readSeconds ?? 0)) {
      await db
        .update(proposalEvents)
        .set({ readSeconds: clamped })
        .where(eq(proposalEvents.id, existing.id));
    }
  } else {
    await db.insert(proposalEvents).values({
      proposalId: p.id,
      kind: 'read',
      sessionKey,
      readSeconds: clamped,
      userAgent: userAgent?.slice(0, 500) ?? null,
    });
  }

  const before = totalBefore?.s ?? 0;
  const after = before - (existing?.readSeconds ?? 0) + Math.max(clamped, existing?.readSeconds ?? 0);
  if (before < READ_INTEREST_SECONDS && after >= READ_INTEREST_SECONDS) {
    const label = `Proposta ${p.number} v${p.version}`;
    await logActivity({
      opportunityId: p.opportunityId,
      type: 'proposal',
      subject: `${label}: cliente leu por ${Math.round(after / 60)} min+ — momento de interesse`,
      metadata: { proposalId: p.id, event: 'read_interest', readSeconds: after },
    });
    await notifyOwner(
      p.opportunityId,
      '🔥 Momento de interesse',
      `Cliente está lendo a ${label} com atenção (${Math.floor(after / 60)}min ${after % 60}s). Bom momento para ligar.`,
    );
  }
}

/**
 * Aceite digital: status 'aceita' + contractSigned na opp + Ganhou + handoff
 * automático → fundeb.consultorias (produto Acelerador FUNDEB). Idempotente:
 * segunda chamada numa proposta já aceita é no-op.
 */
export async function acceptProposalPublic(
  proposalId: number,
  token: string,
  acceptedByName: string,
  acceptedByRole: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await getPublicProposal(proposalId, token);
  if (!p) return { ok: false, error: 'Proposta não encontrada.' };
  if (p.status === 'aceita') return { ok: true };
  if (p.status === 'recusada') {
    return { ok: false, error: 'Esta proposta foi encerrada. Fale com seu consultor i10.' };
  }

  const name = acceptedByName.trim().slice(0, 200);
  if (name.length < 3) return { ok: false, error: 'Informe seu nome completo.' };
  const role = acceptedByRole?.trim().slice(0, 200) || null;

  const op = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, p.opportunityId),
  });
  if (!op) return { ok: false, error: 'Oportunidade não encontrada.' };

  const now = new Date();
  const plan = planAcceptance(
    {
      stage: op.stage,
      products: (op.products ?? []) as string[],
      estimatedValue: op.estimatedValue ?? null,
      closeDate: op.closeDate ?? null,
      contractNotes: op.contractNotes ?? null,
      municipalityId: op.municipalityId ?? null,
      handedOffConsultoriaId: op.handedOffConsultoriaId ?? null,
    },
    { number: p.number, version: p.version, products: (p.products ?? []) as string[], total: p.total },
    name,
    role,
    now,
  );

  await db
    .update(proposals)
    .set({
      status: 'aceita',
      acceptedAt: now,
      acceptedByName: name,
      acceptedByRole: role,
      updatedAt: now,
    })
    .where(eq(proposals.id, p.id));
  await db.insert(proposalEvents).values({ proposalId: p.id, kind: 'accept' });

  await db.update(opportunities).set(plan.patch).where(eq(opportunities.id, op.id));

  await logActivity({
    opportunityId: op.id,
    type: 'contract_signed',
    subject: `Aceite digital: proposta ${p.number} v${p.version}`,
    body: `Aceita por ${name}${role ? ` (${role})` : ''} via página pública.`,
    metadata: { proposalId: p.id, acceptedByName: name, acceptedByRole: role },
  });

  // Paridade com changeStage: kickoff de implantação para produtos não-FUNDEB.
  if (plan.kickoffProducts.length) {
    const due = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await db.insert(tasks).values(
      plan.kickoffProducts.map((pr) => ({
        opportunityId: op.id,
        title: `Kickoff implantação — ${pr}`,
        description: `Gerada automaticamente pelo aceite digital (${PRODUCT_POSVENDA[pr as Product] ?? ''})`,
        dueAt: due,
        assignedTo: op.ownerId,
        createdBy: op.ownerId,
      })),
    );
  }

  // Handoff automático → BNCC-CAPTACAO. Não-fatal: se falhar, o aceite fica
  // registrado e o handoff manual (botão no card) continua disponível.
  if (plan.shouldHandoff) {
    try {
      await autoHandoffToFundeb(op.id, now);
    } catch (e) {
      await logActivity({
        opportunityId: op.id,
        type: 'handoff',
        subject: 'Handoff automático falhou — fazer manualmente pelo card',
        body: e instanceof Error ? e.message : String(e),
        metadata: { proposalId: p.id, autoHandoff: 'failed' },
      });
    }
  }

  await notifyOwner(
    op.id,
    '🎉 Proposta aceita digitalmente!',
    `${p.number} v${p.version} aceita por ${name}${role ? ` (${role})` : ''}. Contrato marcado como assinado.`,
  );

  revalidatePath(`/opportunities/${op.id}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  revalidatePath(`/proposta/${p.id}`);
  return { ok: true };
}

/**
 * Versão automática do handoffToFundeb (src/lib/actions/handoff.ts) para o
 * aceite digital — sem sessão. Kickoff planejado = data do aceite; duração
 * padrão. Mesmo payload/insert do fluxo manual para manter o contrato com o
 * BNCC-CAPTACAO em um único formato.
 */
async function autoHandoffToFundeb(opportunityId: number, startDate: Date): Promise<void> {
  const op = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });
  if (!op || op.handedOffConsultoriaId || !op.municipalityId) return;

  const [owner] = op.ownerId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, op.ownerId)).limit(1)
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

  const endDate = computeEndDate(startDate, DEFAULT_CONSULTORIA_MONTHS);
  const payload = buildConsultoriaPayload(op, owner?.name ?? null, primarySummary, {
    startDate,
    endDate,
    secretaryName: primary?.name ?? null,
  });

  const sqlClient = neon(process.env.DATABASE_URL!);
  type InsertedRow = { id: number };
  const [result] = (await sqlClient.transaction([
    sqlClient`INSERT INTO fundeb.consultorias
        (municipality_id, status, start_date, end_date, notes, consultant_name,
         secretary_name, annotations, assigned_consultor_id, assigned_at,
         created_at, updated_at)
        VALUES (${payload.municipalityId}, ${payload.status},
          ${payload.startDate.toISOString()},
          ${payload.endDate ? payload.endDate.toISOString() : null},
          ${payload.notes}, ${payload.consultantName},
          ${payload.secretaryName}, ${payload.annotations},
          ${op.ownerId},
          ${op.ownerId ? new Date().toISOString() : null},
          NOW(), NOW())
        RETURNING id`,
  ])) as unknown as [InsertedRow[]];

  const consultoriaId = result[0]?.id;
  if (!consultoriaId) throw new Error('Falha ao inserir consultoria (aceite digital)');

  await db
    .update(opportunities)
    .set({ handedOffConsultoriaId: consultoriaId, handedOffAt: new Date(), updatedAt: new Date() })
    .where(eq(opportunities.id, opportunityId));

  await logActivity({
    opportunityId,
    type: 'handoff',
    subject: `Transferida para BNCC-CAPTACAO (consultoria #${consultoriaId}) — automático via aceite digital`,
    body:
      `Kickoff: ${startDate.toLocaleDateString('pt-BR')}` +
      ` · fim previsto: ${endDate.toLocaleDateString('pt-BR')}` +
      ` · consultor: ${payload.consultantName || '—'}`,
    metadata: {
      consultoriaId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      durationMonths: DEFAULT_CONSULTORIA_MONTHS,
      autoHandoff: true,
    },
  });
}

/** Métricas de engajamento para a visão interna da proposta. */
export async function getProposalEngagement(proposalId: number) {
  const [row] = await db
    .select({
      views: sql<number>`count(*) FILTER (WHERE ${proposalEvents.kind} = 'view')::int`,
      readSeconds: sql<number>`coalesce(sum(${proposalEvents.readSeconds}) FILTER (WHERE ${proposalEvents.kind} = 'read'), 0)::int`,
      lastViewAt: sql<Date | null>`max(${proposalEvents.createdAt}) FILTER (WHERE ${proposalEvents.kind} = 'view')`,
    })
    .from(proposalEvents)
    .where(eq(proposalEvents.proposalId, proposalId));
  return {
    views: row?.views ?? 0,
    readSeconds: row?.readSeconds ?? 0,
    lastViewAt: row?.lastViewAt ? new Date(row.lastViewAt) : null,
  };
}
