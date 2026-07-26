import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { activities, contacts as crmContacts, opportunities, tasks } from '../schema';
import { sequences } from '../schema-marketing';
import { STAGES, STAGES_BY_KEY, type StageKey } from '../pipeline';
import { isRotten } from '../forecast';
import { enrollContactInSequence } from './sequence-runner';

// ─── Cadências automáticas do pipeline ─────────────────────────────────────
// Fecha o elo funil → marketing: deal "parado" (isRotten — sem atividade há
// mais que o rotDays do estágio, ver src/lib/forecast.ts) dispara:
//   1. Enroll do contato principal na sequência de follow-up (WhatsApp/email)
//      configurada em PIPELINE_STALLED_SEQUENCE_ID — o sequence-runner cuida
//      dos envios a partir daí.
//   2. Tarefa de "próxima melhor ação" pro dono do deal (prioridade alta).
//   3. Marcador em crm.activities (type 'auto_cadence') — INSERT direto, SEM
//      logActivity: o bump de lastActivityAt "desapodreceria" o deal e
//      mascararia o problema. O marcador também é o dedupe: só re-dispara
//      depois que houver atividade REAL mais nova que o último disparo.
//
// Chamado pelo cron /api/marketing/cron/pipeline-cadences (1x/dia).

export const AUTO_CADENCE_ACTIVITY_TYPE = 'auto_cadence';

const MAX_PER_RUN = 100;
const TASK_DUE_HOURS = 24;

// Sugestão de "próxima melhor ação" por estágio — vira o título da tarefa.
const NEXT_BEST_ACTION: Partial<Record<StageKey, string>> = {
  novo: 'Fazer o primeiro contato com o município (ligação ou WhatsApp)',
  contato_inicial: 'Retomar o contato e preparar o envio do diagnóstico',
  diagnostico_enviado: 'Confirmar se o diagnóstico foi recebido e colher a reação',
  follow_up: 'Ligar para o contato principal e propor a reunião de auditoria',
  reuniao_auditoria: 'Confirmar (ou remarcar) a reunião de auditoria com a Secretaria',
  negociacao: 'Retomar a negociação — revisar proposta e prazo de fechamento',
};

export function nextBestAction(stage: string): string {
  return (
    NEXT_BEST_ACTION[stage as StageKey] ?? 'Retomar o contato com o município'
  );
}

/**
 * Deal deve disparar cadência agora? Regras:
 *  - precisa estar rotten (sem atividade há mais que rotDays do estágio);
 *  - se nunca disparou, dispara;
 *  - se já disparou, só re-dispara depois de atividade real MAIS NOVA que o
 *    último disparo (senão o cron diário spammaria o mesmo deal parado).
 */
export function shouldTriggerCadence(
  op: { stage: string; lastActivityAt: Date | null },
  lastAutoCadenceAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!isRotten(op, now)) return false;
  if (!lastAutoCadenceAt) return true;
  if (!op.lastActivityAt) return false;
  return lastAutoCadenceAt.getTime() < new Date(op.lastActivityAt).getTime();
}

export type CadenceRunResult = {
  scanned: number;
  triggered: number;
  enrolled: number;
  tasksCreated: number;
  errors: number;
  sequenceId: number | null;
  durationMs: number;
};

export async function runPipelineCadences(
  now: Date = new Date(),
): Promise<CadenceRunResult> {
  const start = Date.now();
  const result: CadenceRunResult = {
    scanned: 0,
    triggered: 0,
    enrolled: 0,
    tasksCreated: 0,
    errors: 0,
    sequenceId: null,
    durationMs: 0,
  };

  // Só estágios ativos que apodrecem (rotDays != null)
  const stallableKeys = STAGES.filter(
    (s) => !s.isTerminal && s.rotDays != null,
  ).map((s) => s.key);

  const opps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      ownerId: opportunities.ownerId,
      lastActivityAt: opportunities.lastActivityAt,
    })
    .from(opportunities)
    .where(inArray(opportunities.stage, stallableKeys));
  result.scanned = opps.length;
  if (opps.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  // Último disparo por opp (marcador 'auto_cadence') — base do dedupe
  const markerRows = await db
    .select({
      opportunityId: activities.opportunityId,
      last: sql<string | null>`max(${activities.occurredAt})`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.type, AUTO_CADENCE_ACTIVITY_TYPE),
        inArray(activities.opportunityId, opps.map((o) => o.id)),
      ),
    )
    .groupBy(activities.opportunityId);
  const markerMap = new Map(
    markerRows.map((r) => [r.opportunityId, r.last ? new Date(r.last) : null]),
  );

  const due = opps
    .filter((o) => shouldTriggerCadence(o, markerMap.get(o.id) ?? null, now))
    .slice(0, MAX_PER_RUN);

  // Sequência de follow-up configurada? Sem ela ainda criamos a tarefa, só
  // não fazemos o enroll.
  const rawSeqId = Number(process.env.PIPELINE_STALLED_SEQUENCE_ID ?? '');
  if (Number.isInteger(rawSeqId) && rawSeqId > 0) {
    const seqRows = await db
      .select({ id: sequences.id, status: sequences.status })
      .from(sequences)
      .where(eq(sequences.id, rawSeqId))
      .limit(1);
    if (seqRows[0] && seqRows[0].status === 'active') {
      result.sequenceId = seqRows[0].id;
    } else {
      console.warn(
        `[pipeline-cadences] PIPELINE_STALLED_SEQUENCE_ID=${rawSeqId} ` +
          `inexistente ou não-ativa — enroll desabilitado nesta execução`,
      );
    }
  }

  for (const opp of due) {
    try {
      const stageDef = STAGES_BY_KEY[opp.stage as StageKey];
      const daysStalled = opp.lastActivityAt
        ? Math.floor((now.getTime() - new Date(opp.lastActivityAt).getTime()) / 86_400_000)
        : null;

      // Contato principal da opp (fallback: primeiro cadastrado)
      const contactRows = await db
        .select({
          id: crmContacts.id,
          marketingContactId: crmContacts.marketingContactId,
        })
        .from(crmContacts)
        .where(eq(crmContacts.opportunityId, opp.id))
        .orderBy(desc(crmContacts.isPrimary), asc(crmContacts.id))
        .limit(1);
      const contact = contactRows[0];

      let enrolled = false;
      let enrollReason: string | null = null;
      if (!result.sequenceId) {
        enrollReason = 'sequence_not_configured';
      } else if (!contact?.marketingContactId) {
        enrollReason = 'no_marketing_contact';
      } else {
        const r = await enrollContactInSequence(
          contact.marketingContactId,
          result.sequenceId,
        );
        enrolled = r.enrolled;
        enrollReason = r.reason ?? null;
        if (enrolled) result.enrolled += 1;
      }

      const action = nextBestAction(opp.stage);
      const stalledLabel =
        daysStalled != null
          ? `há ${daysStalled} dia(s) sem atividade`
          : 'sem nenhuma atividade registrada';
      const [task] = await db
        .insert(tasks)
        .values({
          opportunityId: opp.id,
          title: `Próxima melhor ação: ${action}`,
          description:
            `Deal parado no estágio "${stageDef?.label ?? opp.stage}" — ${stalledLabel} ` +
            `(limite do estágio: ${stageDef?.rotDays} dias). ` +
            (enrolled
              ? 'Contato principal inscrito na sequência automática de follow-up. '
              : '') +
            'Tarefa gerada automaticamente pela cadência do pipeline.',
          dueAt: new Date(now.getTime() + TASK_DUE_HOURS * 3_600_000),
          assignedTo: opp.ownerId,
          createdBy: null,
          priority: 'high',
        })
        .returning({ id: tasks.id });
      result.tasksCreated += 1;

      // Marcador do disparo — insert direto, sem bump de lastActivityAt (ver
      // comentário no topo do arquivo).
      await db.insert(activities).values({
        opportunityId: opp.id,
        type: AUTO_CADENCE_ACTIVITY_TYPE,
        subject: 'Cadência automática disparada',
        body:
          `Deal ${stalledLabel} no estágio "${stageDef?.label ?? opp.stage}". ` +
          (enrolled
            ? `Contato inscrito na sequência #${result.sequenceId}.`
            : `Sem enroll em sequência (${enrollReason ?? 'motivo desconhecido'}).`) +
          ` Tarefa #${task.id} criada.`,
        actorId: null,
        metadata: {
          stage: opp.stage,
          daysStalled,
          sequenceId: result.sequenceId,
          enrolled,
          enrollReason,
          taskId: task.id,
        },
      });
      result.triggered += 1;
    } catch (err) {
      result.errors += 1;
      console.error(
        `[pipeline-cadences] opp ${opp.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}
