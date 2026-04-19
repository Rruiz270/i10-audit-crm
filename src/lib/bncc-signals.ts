import { neon } from '@neondatabase/serverless';

/**
 * Read-only signals vindos do BNCC-CAPTACAO. O CRM consome esses dados pra:
 *   · mostrar "1º relatório entregue ✓" no card da oportunidade
 *   · mover pills no Kanban quando planos/documentos são aprovados
 *   · decidir alertas de atraso (ex: consultoria >30d sem nenhum sinal)
 *
 * IMPORTANTE: nunca escrevemos em fundeb.* fora do handoff. Tudo aqui é SELECT.
 */
export type BnccSignals = {
  reportsCount: number;
  lastReportAt: Date | null;
  lastReportTipo: string | null;
  actionPlansTotal: number;
  actionPlansCompleted: number;
  actionPlansOverdue: number;
  evidencesCount: number;
  scenariosCount: number;
  documentsCount: number;
  documentsApproved: number;
  lastActivityAt: Date | null; // último timestamp entre todos os sinais
};

const EMPTY: BnccSignals = {
  reportsCount: 0,
  lastReportAt: null,
  lastReportTipo: null,
  actionPlansTotal: 0,
  actionPlansCompleted: 0,
  actionPlansOverdue: 0,
  evidencesCount: 0,
  scenariosCount: 0,
  documentsCount: 0,
  documentsApproved: 0,
  lastActivityAt: null,
};

function sqlClient() {
  return neon(process.env.DATABASE_URL!);
}

export async function getConsultoriaSignals(
  consultoriaId: number | null,
  municipalityId: number | null,
): Promise<BnccSignals> {
  if (!consultoriaId && !municipalityId) return EMPTY;

  const sql = sqlClient();

  // Em paralelo: relatórios, action_plans, evidences, scenarios, documents
  const [relatorios, actionPlans, evidences, scenarios, documents] = await Promise.all([
    consultoriaId
      ? sql`SELECT count(*)::int AS n, max(created_at) AS last_at,
               (array_agg(tipo ORDER BY created_at DESC))[1] AS last_tipo
             FROM fundeb.relatorios WHERE consultoria_id = ${consultoriaId}`
      : Promise.resolve([{ n: 0, last_at: null, last_tipo: null }]),
    // action_plans.due_date é TEXT (valores como "7-11 Abr" existem em prod).
    // Aplicamos um cast defensivo via regex — só datas ISO (YYYY-MM-DD) contam pra overdue.
    municipalityId
      ? sql`SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS done,
              count(*) FILTER (
                WHERE completed_at IS NULL
                AND due_date IS NOT NULL
                AND due_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
                AND due_date::date < CURRENT_DATE
              )::int AS overdue,
              max(completed_at) AS last_at
             FROM fundeb.action_plans WHERE municipality_id = ${municipalityId}`
      : Promise.resolve([{ total: 0, done: 0, overdue: 0, last_at: null }]),
    consultoriaId
      ? sql`SELECT count(*)::int AS n, max(uploaded_at) AS last_at
             FROM fundeb.evidences WHERE consultoria_id = ${consultoriaId}`
      : Promise.resolve([{ n: 0, last_at: null }]),
    consultoriaId
      ? sql`SELECT count(*)::int AS n, max(updated_at) AS last_at
             FROM fundeb.scenarios WHERE consultoria_id = ${consultoriaId}`
      : Promise.resolve([{ n: 0, last_at: null }]),
    municipalityId
      ? sql`SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE status IN ('approved','aprovado'))::int AS approved,
              max(updated_at) AS last_at
             FROM fundeb.documents WHERE municipality_id = ${municipalityId}`
      : Promise.resolve([{ total: 0, approved: 0, last_at: null }]),
  ]);

  const last = [
    relatorios[0]?.last_at,
    actionPlans[0]?.last_at,
    evidences[0]?.last_at,
    scenarios[0]?.last_at,
    documents[0]?.last_at,
  ]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime());
  const lastActivityAt = last.length ? new Date(Math.max(...last)) : null;

  return {
    reportsCount: relatorios[0]?.n ?? 0,
    lastReportAt: relatorios[0]?.last_at ? new Date(relatorios[0].last_at) : null,
    lastReportTipo: relatorios[0]?.last_tipo ?? null,
    actionPlansTotal: actionPlans[0]?.total ?? 0,
    actionPlansCompleted: actionPlans[0]?.done ?? 0,
    actionPlansOverdue: actionPlans[0]?.overdue ?? 0,
    evidencesCount: evidences[0]?.n ?? 0,
    scenariosCount: scenarios[0]?.n ?? 0,
    documentsCount: documents[0]?.total ?? 0,
    documentsApproved: documents[0]?.approved ?? 0,
    lastActivityAt,
  };
}

/**
 * Lote — pega sinais de várias consultorias de uma só vez. Usado no Kanban
 * e em listagens onde renderizamos várias cards handed-off.
 */
export async function getConsultoriaSignalsBatch(
  pairs: Array<{ consultoriaId: number | null; municipalityId: number | null }>,
): Promise<Record<string, BnccSignals>> {
  const out: Record<string, BnccSignals> = {};
  // Poderia ser otimizado com um único query agregando; pra volumes pequenos
  // (hoje < 100 handoffs ativos) o fan-out é OK.
  await Promise.all(
    pairs.map(async (p) => {
      const key = `${p.consultoriaId ?? ''}:${p.municipalityId ?? ''}`;
      out[key] = await getConsultoriaSignals(p.consultoriaId, p.municipalityId);
    }),
  );
  return out;
}

/**
 * Decide quais "badges" mostrar na UI dado um conjunto de sinais.
 * Lógica está separada para ser testável sem tocar DB.
 */
export type SignalBadge = {
  label: string;
  tone: 'mint' | 'cyan' | 'amber' | 'rose' | 'navy';
  icon?: string;
};

export function signalsToBadges(s: BnccSignals): SignalBadge[] {
  const out: SignalBadge[] = [];
  if (s.reportsCount > 0) {
    out.push({
      label:
        s.reportsCount === 1
          ? '1º relatório entregue'
          : `${s.reportsCount} relatórios entregues`,
      tone: 'mint',
      icon: '📄',
    });
  }
  if (s.documentsApproved > 0) {
    out.push({
      label: `${s.documentsApproved} doc${s.documentsApproved > 1 ? 's' : ''} aprovado${s.documentsApproved > 1 ? 's' : ''}`,
      tone: 'cyan',
      icon: '✓',
    });
  }
  if (s.actionPlansCompleted > 0) {
    out.push({
      label: `${s.actionPlansCompleted}/${s.actionPlansTotal} planos concluídos`,
      tone: s.actionPlansCompleted === s.actionPlansTotal ? 'mint' : 'navy',
    });
  }
  if (s.actionPlansOverdue > 0) {
    out.push({
      label: `${s.actionPlansOverdue} plano${s.actionPlansOverdue > 1 ? 's' : ''} atrasado${s.actionPlansOverdue > 1 ? 's' : ''}`,
      tone: 'rose',
      icon: '⏰',
    });
  }
  if (s.evidencesCount > 0) {
    out.push({
      label: `${s.evidencesCount} evidência${s.evidencesCount > 1 ? 's' : ''}`,
      tone: 'cyan',
    });
  }
  if (s.scenariosCount > 0) {
    out.push({
      label: `${s.scenariosCount} cenário${s.scenariosCount > 1 ? 's' : ''} FUNDEB`,
      tone: 'navy',
    });
  }
  return out;
}
