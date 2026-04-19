import { and, count, eq, gte, isNotNull, isNull, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, activities, meetings, contacts } from '@/lib/schema';
import { STAGES, ACTIVE_STAGES } from '@/lib/pipeline';
import { StageBadge } from '@/components/ui/stage-badge';
import { weightedValue, isRotten } from '@/lib/forecast';
import { LOST_REASONS_BY_CODE, type LostReasonCode } from '@/lib/lost-reasons';
import type { StageKey } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 3600_000);

  const stageCounts = await db
    .select({ stage: opportunities.stage, n: count() })
    .from(opportunities)
    .groupBy(opportunities.stage);

  const stageMap = Object.fromEntries(stageCounts.map((r) => [r.stage, Number(r.n)]));

  const [pipelineValue] = await db
    .select({ total: sum(opportunities.estimatedValue) })
    .from(opportunities)
    .where(
      and(
        isNotNull(opportunities.estimatedValue),
      ),
    );

  const [wonLast30] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'ganhou'), gte(opportunities.wonAt, since30)));

  const [lostLast30] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'perdido'), gte(opportunities.lostAt, since30)));

  const [pendingHandoff] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(eq(opportunities.stage, 'ganhou'), isNull(opportunities.handedOffConsultoriaId)),
    );

  const [totalOps] = await db.select({ n: count() }).from(opportunities);
  const [totalActivities] = await db.select({ n: count() }).from(activities);
  const [totalMeetings] = await db.select({ n: count() }).from(meetings);
  const [totalContacts] = await db.select({ n: count() }).from(contacts);

  // Forecast ponderado usando STAGES_BY_KEY.probability
  const activeOps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      lastActivityAt: opportunities.lastActivityAt,
    })
    .from(opportunities);
  const activeOnly = activeOps.filter((o) =>
    ACTIVE_STAGES.some((s) => s.key === o.stage),
  );
  const weighted = weightedValue(
    activeOnly.map((o) => ({ stage: o.stage, estimatedValue: o.estimatedValue })),
  );
  const rottenCount = activeOnly.filter((o) =>
    isRotten({ stage: o.stage, lastActivityAt: o.lastActivityAt }),
  ).length;

  // Breakdown de motivos de perda
  const lossBreakdown = await db
    .select({ code: opportunities.lostReasonCode, n: count() })
    .from(opportunities)
    .where(eq(opportunities.stage, 'perdido'))
    .groupBy(opportunities.lostReasonCode);
  const lossTotal = lossBreakdown.reduce((sum, r) => sum + Number(r.n), 0);

  const cards = [
    { label: 'Oportunidades', value: totalOps?.n ?? 0 },
    {
      label: 'Pipeline nominal (R$)',
      value: Number(pipelineValue?.total ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }),
    },
    {
      label: 'Forecast ponderado (R$)',
      value: weighted.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }),
    },
    { label: 'Ganhas (30d)', value: wonLast30?.n ?? 0 },
    { label: 'Perdidas (30d)', value: lostLast30?.n ?? 0 },
    { label: 'Handoffs pendentes', value: pendingHandoff?.n ?? 0 },
    { label: 'Oportunidades paradas', value: rottenCount },
    { label: 'Atividades', value: totalActivities?.n ?? 0 },
    { label: 'Reuniões', value: totalMeetings?.n ?? 0 },
    { label: 'Contatos', value: totalContacts?.n ?? 0 },
  ];

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Relatórios</h1>
        <p className="text-sm text-slate-500 mt-1">Visão gerencial do funil de captação.</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{String(c.value)}</div>
          </div>
        ))}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Motivos de perda ({lossTotal} perda{lossTotal === 1 ? '' : 's'} registrada{lossTotal === 1 ? '' : 's'})
        </h2>
        {lossBreakdown.length === 0 ? (
          <div className="text-xs text-slate-400 italic">Sem perdas registradas ainda.</div>
        ) : (
          <ul className="space-y-2">
            {lossBreakdown
              .sort((a, b) => Number(b.n) - Number(a.n))
              .map((r) => {
                const info = r.code ? LOST_REASONS_BY_CODE[r.code as LostReasonCode] : undefined;
                const n = Number(r.n);
                const pct = lossTotal > 0 ? Math.round((n / lossTotal) * 100) : 0;
                return (
                  <li key={r.code ?? '_null'} className="flex items-center gap-3">
                    <div className="w-48 text-sm text-slate-700">
                      {info?.label ?? r.code ?? '(sem código)'}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-rose-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-20 text-right text-xs text-slate-600 tabular-nums">
                      {n} ({pct}%)
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Distribuição por estágio</h2>
        <ul className="space-y-2">
          {STAGES.map((s) => {
            const n = stageMap[s.key] ?? 0;
            const max = Math.max(...Object.values(stageMap), 1);
            const pct = Math.round((n / max) * 100);
            return (
              <li key={s.key} className="flex items-center gap-3">
                <div className="w-40"><StageBadge stage={s.key as StageKey} /></div>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-i10-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-10 text-right text-sm text-slate-700 tabular-nums">{n}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
