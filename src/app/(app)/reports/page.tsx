import Link from 'next/link';
import { and, count, eq, gte, isNotNull, isNull, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, activities, meetings, contacts } from '@/lib/schema';
import { STAGES, ACTIVE_STAGES } from '@/lib/pipeline';
import { StageBadge } from '@/components/ui/stage-badge';
import { KpiTile } from '@/components/ui/kpi-tile';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { weightedValue, isRotten } from '@/lib/forecast';
import { LOST_REASONS_BY_CODE, type LostReasonCode } from '@/lib/lost-reasons';
import type { StageKey } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const WINDOWS: Record<string, number> = { '7': 7, '30': 30, '90': 90 };

function brl(v: number) {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = WINDOWS[sp.window ?? '30'] ?? 30;
  const now = new Date();
  // Janela parametrizada (substitui o 30d hardcoded) — reusa a mesma lógica.
  const since = new Date(now.getTime() - windowDays * 24 * 3600_000);

  const stageCounts = await db
    .select({ stage: opportunities.stage, n: count() })
    .from(opportunities)
    .groupBy(opportunities.stage);

  const stageMap = Object.fromEntries(stageCounts.map((r) => [r.stage, Number(r.n)]));

  const [pipelineValue] = await db
    .select({ total: sum(opportunities.estimatedValue) })
    .from(opportunities)
    .where(and(isNotNull(opportunities.estimatedValue)));

  const [wonInWindow] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'ganhou'), gte(opportunities.wonAt, since)));

  const [lostInWindow] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'perdido'), gte(opportunities.lostAt, since)));

  const [pendingHandoff] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'ganhou'), isNull(opportunities.handedOffConsultoriaId)));

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
  const activeOnly = activeOps.filter((o) => ACTIVE_STAGES.some((s) => s.key === o.stage));
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
  const lossTotal = lossBreakdown.reduce((s, r) => s + Number(r.n), 0);

  const won = wonInWindow?.n ?? 0;
  const lost = lostInWindow?.n ?? 0;
  const closed = won + lost;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const handoffs = pendingHandoff?.n ?? 0;

  // ── Funil: estágios ativos em ordem, com conversão entre etapas ──
  const funnelStages = STAGES.filter((s) => !s.isTerminal);
  const funnelData = funnelStages.map((s) => ({
    key: s.key as StageKey,
    label: s.label,
    n: stageMap[s.key] ?? 0,
  }));
  const funnelMax = Math.max(...funnelData.map((d) => d.n), 1);

  const periodLabel = `${windowDays}d`;

  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
            Operação
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Relatórios
          </h1>
        </div>
        <SegmentedControl
          value={String(windowDays)}
          options={[
            { value: '7', label: '7d', href: '/reports?window=7' },
            { value: '30', label: '30d', href: '/reports?window=30' },
            { value: '90', label: '90d', href: '/reports?window=90' },
          ]}
        />
      </header>

      {/* ── Resultados (destaque financeiro) ── */}
      <Band title="Resultados">
        <KpiTile icon="chart" tone="cyan" value={brl(Number(pipelineValue?.total ?? 0))} label="Pipeline nominal" />
        <KpiTile icon="activity" tone="mint" value={brl(weighted)} label="Forecast ponderado" />
        <KpiTile icon="check" tone="mint" value={`${winRate}%`} label={`Win rate (${periodLabel})`} />
        <KpiTile icon="flag" tone="navy" value={won} label={`Ganhas (${periodLabel})`} />
      </Band>

      {/* ── Alertas (clicáveis → listas filtradas) ── */}
      <Band title="Alertas">
        <KpiTile
          icon="alert-triangle"
          tone="rose"
          value={rottenCount}
          label="Oportunidades paradas"
          href="/pipeline"
          badge={rottenCount > 0 ? { text: 'ação', tone: 'rose' } : undefined}
        />
        <KpiTile
          icon="git-branch"
          tone="amber"
          value={handoffs}
          label="Handoffs pendentes"
          href="/opportunities?stage=ganhou"
          badge={handoffs > 0 ? { text: 'ação', tone: 'amber' } : undefined}
        />
        <KpiTile
          icon="x-circle"
          tone="rose"
          value={lost}
          label={`Perdidas (${periodLabel})`}
          href="/opportunities?stage=perdido"
        />
        <KpiTile icon="clock" tone="amber" value="Tarefas" label="Atrasadas e a vencer" href="/tasks?filter=all" />
      </Band>

      {/* ── Volume ── */}
      <Band title="Volume">
        <KpiTile icon="briefcase" tone="navy" value={totalOps?.n ?? 0} label="Oportunidades" />
        <KpiTile icon="activity" tone="slate" value={totalActivities?.n ?? 0} label="Atividades" />
        <KpiTile icon="calendar" tone="slate" value={totalMeetings?.n ?? 0} label="Reuniões" />
        <KpiTile icon="users" tone="slate" value={totalContacts?.n ?? 0} label="Contatos" />
      </Band>

      {/* ── Funil por produto (mockup) ── */}
      <FunilPorProduto />

      <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Funil de conversão ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
            Funil de conversão
          </h2>
          <div className="space-y-1">
            {funnelData.map((d, i) => {
              const widthPct = Math.max(8, Math.round((d.n / funnelMax) * 100));
              const prev = i > 0 ? funnelData[i - 1] : null;
              const convPct =
                prev && prev.n > 0 ? Math.round((d.n / prev.n) * 100) : null;
              return (
                <div key={d.key}>
                  {convPct != null && (
                    <div className="py-0.5 pl-1 text-[11px] text-slate-400">↓ {convPct}%</div>
                  )}
                  <Link
                    href={`/opportunities?stage=${d.key}`}
                    className="group flex items-center gap-3"
                    title={`Ver oportunidades em ${d.label}`}
                  >
                    <div className="flex-1">
                      <div
                        className="flex items-center justify-between rounded-md bg-gradient-to-r from-i10-cyan to-i10-mint px-3 py-2 text-xs font-semibold text-i10-navy-dark transition group-hover:brightness-105"
                        style={{ width: `${widthPct}%`, minWidth: '7rem' }}
                      >
                        <span className="truncate">{d.label}</span>
                        <span className="tabular-nums">{d.n}</span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {funnelData.map((d) => (
              <Link key={d.key} href={`/opportunities?stage=${d.key}`}>
                <StageBadge stage={d.key} />
              </Link>
            ))}
          </div>
        </section>

        {/* ── Motivos de perda ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
            Motivos de perda{' '}
            <span className="font-normal text-slate-400">
              ({lossTotal} perda{lossTotal === 1 ? '' : 's'})
            </span>
          </h2>
          {lossBreakdown.length === 0 ? (
            <div className="text-xs italic text-slate-400">Sem perdas registradas ainda.</div>
          ) : (
            <ul className="space-y-3">
              {lossBreakdown
                .sort((a, b) => Number(b.n) - Number(a.n))
                .map((r) => {
                  const info = r.code ? LOST_REASONS_BY_CODE[r.code as LostReasonCode] : undefined;
                  const n = Number(r.n);
                  const pct = lossTotal > 0 ? Math.round((n / lossTotal) * 100) : 0;
                  return (
                    <li key={r.code ?? '_null'}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{info?.label ?? r.code ?? '(sem código)'}</span>
                        <span className="tabular-nums text-xs text-slate-500">
                          {n} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  );
}


// ─── Funil por produto — abertas, ganhas 30d, valor ganho, conversão ────────
async function FunilPorProduto() {
  const PRODUCT_TONES: Record<string, string> = {
    'Acelerador FUNDEB': 'bg-i10-700 text-white',
    'Ensino Integral': 'bg-emerald-50 text-emerald-700',
    'Escola Online': 'bg-cyan-50 text-cyan-700',
    'Município Bilíngue': 'bg-violet-50 text-violet-700',
    'Radar Fiscal 360': 'bg-blue-50 text-blue-700',
    'Emendas Impositivas': 'bg-amber-50 text-amber-700',
  };
  const PRODUCT_LIST = Object.keys(PRODUCT_TONES);
  const rows = await db
    .select({
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      products: opportunities.products,
      tags: opportunities.tags,
      wonAt: opportunities.wonAt,
    })
    .from(opportunities);
  const cutoff = Date.now() - 30 * 24 * 3600_000;
  const OPEN = new Set(['novo', 'contato_inicial', 'diagnostico_enviado', 'follow_up', 'reuniao_auditoria', 'negociacao']);
  const matches = (r: (typeof rows)[number], prod: string) =>
    ((r.products ?? []) as string[]).includes(prod) ||
    (r.tags ?? []).some((t) => t.toLowerCase() === prod.toLowerCase());
  const data = PRODUCT_LIST.map((prod) => {
    const mine = rows.filter((r) => matches(r, prod));
    const open = mine.filter((r) => OPEN.has(r.stage)).length;
    const won30 = mine.filter((r) => r.stage === 'ganhou' && r.wonAt && new Date(r.wonAt).getTime() >= cutoff);
    const wonValue = won30.reduce((sum, r) => sum + (r.estimatedValue ?? 0), 0);
    const closed = mine.filter((r) => r.stage === 'ganhou' || r.stage === 'perdido').length;
    const wonAll = mine.filter((r) => r.stage === 'ganhou').length;
    const conv = closed > 0 ? Math.round((wonAll / closed) * 100) : null;
    return { prod, open, won30: won30.length, wonValue, conv };
  });

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
        Funil por produto{' '}
        <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
          novo
        </span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Produto</th>
              <th className="py-2 pr-3 text-right">Abertas</th>
              <th className="py-2 pr-3 text-right">Ganhas 30d</th>
              <th className="py-2 pr-3 text-right">Valor ganho</th>
              <th className="py-2 text-right">Conversão</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.prod} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-3">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${PRODUCT_TONES[d.prod]}`}>{d.prod}</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono">{d.open}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{d.won30}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{d.wonValue > 0 ? brl(d.wonValue) : '—'}</td>
                <td className="py-2.5 text-right font-mono">{d.conv != null ? `${d.conv}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
