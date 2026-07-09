import Link from 'next/link';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { ACTIVE_STAGES } from '@/lib/pipeline';
import { db } from '@/lib/db';
import { opportunities, leadSubmissions, activities, fundebMunicipalities } from '@/lib/schema';
import { StageBadge, stageAccentColor } from '@/components/ui/stage-badge';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Card, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { listMyOpenTasks, listOverdueTasks } from '@/lib/actions/tasks';
import { listConsultoriasByKickoffWindow } from '@/lib/actions/handoff';
import {
  getMyActiveOpportunitiesForForecast,
  getMyStats,
} from '@/lib/actions/me';
import { requireUser } from '@/lib/session';
import { visibilityCondition } from '@/lib/visibility';
import { weightedValue, isRotten } from '@/lib/forecast';
import type { StageKey } from '@/lib/pipeline';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const visibility = visibilityCondition(user);

  const [negCount] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(and(eq(opportunities.stage, 'negociacao'), visibility));

  const [pendingHandoff] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(eq(opportunities.stage, 'ganhou'), isNull(opportunities.handedOffConsultoriaId), visibility),
    );

  const [newLeads] = await db
    .select({ n: count() })
    .from(leadSubmissions)
    .where(eq(leadSubmissions.triaged, false));

  const recent = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      createdAt: opportunities.createdAt,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(visibility)
    .orderBy(desc(opportunities.createdAt))
    .limit(8);

  const recentActivity = await db
    .select()
    .from(activities)
    .orderBy(desc(activities.occurredAt))
    .limit(10);

  // Pipeline ponderado + oportunidades paradas
  const activeOps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      lastActivityAt: opportunities.lastActivityAt,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(opportunities)
    .leftJoin(
      fundebMunicipalities,
      eq(opportunities.municipalityId, fundebMunicipalities.id),
    )
    .where(visibility);

  const activeOnly = activeOps.filter((o) =>
    ACTIVE_STAGES.some((s) => s.key === o.stage),
  );
  const weighted = weightedValue(
    activeOnly.map((o) => ({ stage: o.stage, estimatedValue: o.estimatedValue })),
  );
  const rottenList = activeOnly.filter((o) =>
    isRotten({ stage: o.stage, lastActivityAt: o.lastActivityAt }),
  );

  // Mini-funil: por estágio ativo, count + valor ponderado. Reusa activeOnly
  // (mesmo dataset do forecast acima). maxW serve de escala das barras.
  const funnel = ACTIVE_STAGES.map((s) => {
    const ops = activeOnly.filter((o) => o.stage === s.key);
    const weightedStage = weightedValue(
      ops.map((o) => ({ stage: o.stage, estimatedValue: o.estimatedValue })),
    );
    return { key: s.key as StageKey, label: s.label, color: s.color, count: ops.length, weighted: weightedStage };
  });
  const maxW = Math.max(1, ...funnel.map((f) => f.weighted));

  // Pipeline por produto (mockup): valor nominal das opps ativas agrupado
  // pelo produto (products[0] ou tag de produto como fallback).
  const PRODUCT_LIST = [
    'Acelerador FUNDEB',
    'Município Bilíngue',
    'Ensino Integral',
    'Escola Online',
    'Radar Fiscal 360',
  ];
  const byProduct = PRODUCT_LIST.map((prod) => {
    const total = activeOnly
      .filter((o) => {
        const extra = o as { products?: string[] | null; tags?: string[] | null };
        const prods = extra.products ?? [];
        const tags = (extra.tags ?? []).map((t) => t.toLowerCase());
        return prods.includes(prod) || tags.includes(prod.toLowerCase());
      })
      .reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
    return { prod, total };
  }).sort((a, b) => b.total - a.total);
  const maxProd = Math.max(1, ...byProduct.map((b) => b.total));

  const myTasks = await listMyOpenTasks(user.id);
  const overdueTeam = await listOverdueTasks();
  const nowMs = new Date().getTime();
  const myOverdue = myTasks.filter((t) => new Date(t.dueAt).getTime() < nowMs);

  // Kickoffs da consultoria:
  //   · Esta semana (start entre hoje e +7d)
  //   · Atrasados (start já passou, mas status ainda não ficou 'completed')
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const in7days = new Date(todayStart.getTime() + 7 * 24 * 3600_000);
  const yesterday = new Date(todayStart.getTime() - 24 * 3600_000);

  const [kickoffsThisWeek, kickoffsPast] = await Promise.all([
    listConsultoriasByKickoffWindow({ from: todayStart, to: in7days }),
    listConsultoriasByKickoffWindow({ to: yesterday }),
  ]);

  // Meu forecast + stats pessoais
  const [myOpsForForecast, myStats] = await Promise.all([
    getMyActiveOpportunitiesForForecast(user.id),
    getMyStats(user.id),
  ]);
  const myWeighted = weightedValue(
    myOpsForForecast.map((o) => ({ stage: o.stage, estimatedValue: o.estimatedValue })),
  );
  const myNominal = myOpsForForecast.reduce(
    (sum, o) => sum + (o.estimatedValue ?? 0),
    0,
  );

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="i10-eyebrow mb-2">Instituto i10 · Captação</div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
            Dashboard
          </h1>
          <div className="i10-divider mt-3" />
          <p
            className="text-slate-600 mt-4 max-w-2xl"
            style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '17px', lineHeight: 1.7 }}
          >
            Visão geral do pipeline — onde estão as oportunidades, o que vence
            esta semana e onde o fluxo está parado.
          </p>
        </div>
        <Link href="/opportunities/new">
          <Button variant="accent">
            <Icon name="plus" size={16} /> Nova oportunidade
          </Button>
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiTile
          href="/reports"
          icon="chart"
          tone="cyan"
          value={brl(weighted)}
          label="forecast ponderado"
        />
        <KpiTile
          href="/opportunities?stage=negociacao"
          icon="briefcase"
          tone="navy"
          value={negCount?.n ?? 0}
          label="em negociação"
        />
        <KpiTile
          href="/opportunities?stage=ganhou"
          icon="users"
          tone="mint"
          value={pendingHandoff?.n ?? 0}
          label="handoffs pendentes"
          badge={(pendingHandoff?.n ?? 0) > 0 ? { text: String(pendingHandoff?.n ?? 0), tone: 'mint' } : undefined}
        />
        <KpiTile
          href="/leads"
          icon="inbox"
          tone="amber"
          value={newLeads?.n ?? 0}
          label="leads não triados"
          badge={(newLeads?.n ?? 0) > 0 ? { text: 'novo', tone: 'amber' } : undefined}
        />
        <KpiTile
          href="/opportunities"
          icon="clock"
          tone="rose"
          value={rottenList.length}
          label="oportunidades paradas"
          badge={rottenList.length > 0 ? { text: 'ação', tone: 'rose' } : undefined}
        />
      </section>

      {/* ─── Meu pipeline (visão pessoal do consultor) ───────────────────── */}
      <section
        className="rounded-xl p-6 text-white mb-6"
        style={{ background: 'var(--i10-gradient-main)' }}
      >
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div
              className="text-[11px] font-bold uppercase"
              style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
            >
              Meu pipeline · visão pessoal
            </div>
            <h2 className="text-xl font-bold mt-1">
              {myStats.activeOps} oportunidade{myStats.activeOps === 1 ? '' : 's'} ativa{myStats.activeOps === 1 ? '' : 's'} na minha carteira
            </h2>
          </div>
          <div className="flex gap-2">
            <Link
              href="/pipeline?mine=1"
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              Pipeline →
            </Link>
            <Link
              href="/opportunities?mine=1"
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              Lista →
            </Link>
            <Link
              href="/me"
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              Meu perfil →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider">Pipeline nominal</div>
            <div className="text-2xl font-bold mt-1">
              {myNominal.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider">Forecast ponderado</div>
            <div className="text-2xl font-bold mt-1" style={{ color: 'var(--i10-mint)' }}>
              {myWeighted.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider">Ganhas (30d)</div>
            <div className="text-2xl font-bold mt-1">
              {myStats.won30}
              <span className="text-sm text-white/60 font-normal"> / {myStats.won30 + myStats.lost30}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-white/60 uppercase tracking-wider">Win rate (30d)</div>
            <div className="text-2xl font-bold mt-1">
              {myStats.won30 + myStats.lost30 === 0
                ? '—'
                : `${Math.round(myStats.winRate30 * 100)}%`}
            </div>
          </div>
        </div>
      </section>

      {/* Kickoff de consultorias — strip horizontal de chips (handshake BNCC) */}
      {(kickoffsThisWeek.length > 0 || kickoffsPast.length > 0) && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-i10-cyan-wash text-i10-cyan-dark">
              <Icon name="git-branch" size={16} />
            </span>
            <CardTitle>
              Kickoffs esta semana · {kickoffsThisWeek.length}
            </CardTitle>
            {kickoffsPast.length > 0 && (
              <span className="text-xs text-slate-400">
                + {kickoffsPast.length} já ativa{kickoffsPast.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {kickoffsThisWeek.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {kickoffsThisWeek.slice(0, 8).map((k) => {
                const d = Math.round(
                  (new Date(k.startDate!).getTime() - nowMs) / (24 * 3600_000),
                );
                return (
                  <Link
                    key={k.consultoriaId}
                    href={`/opportunities/${k.opportunityId}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs hover:border-cyan-300 hover:bg-white transition"
                  >
                    <span className="font-semibold" style={{ color: 'var(--i10-navy)' }}>
                      {k.municipalityName ?? `#${k.opportunityId}`}
                    </span>
                    <span className="text-slate-400">
                      {d === 0 ? 'hoje' : `${d}d`} · {k.consultantName ?? 'consultor pendente'}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              Nenhum kickoff novo esta semana.
            </div>
          )}
        </section>
      )}

      {/* Attention widgets */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <section className="bg-white border border-amber-200 bg-amber-50/40 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-amber-900 mb-3">
            Minhas tarefas atrasadas ({myOverdue.length})
          </h2>
          {myOverdue.length === 0 ? (
            <div className="text-xs text-amber-800 italic">Nada atrasado — siga em frente.</div>
          ) : (
            <ul className="space-y-1.5">
              {myOverdue.slice(0, 5).map((t) => (
                <li key={t.id} className="text-xs flex items-center justify-between gap-2">
                  <Link href={`/opportunities/${t.opportunityId}`} className="truncate text-amber-900 hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-rose-700 whitespace-nowrap">
                    {new Date(t.dueAt).toLocaleDateString('pt-BR')}
                  </span>
                </li>
              ))}
              {myOverdue.length > 5 && (
                <li className="text-xs">
                  <Link href="/tasks" className="text-amber-800 underline">
                    Ver todas →
                  </Link>
                </li>
              )}
            </ul>
          )}
          {overdueTeam.length > myOverdue.length && (
            <div className="mt-3 pt-3 border-t border-amber-200 text-[11px] text-amber-700">
              {overdueTeam.length - myOverdue.length} tarefa{overdueTeam.length - myOverdue.length === 1 ? '' : 's'} atrasada{overdueTeam.length - myOverdue.length === 1 ? '' : 's'} em outras carteiras ·{' '}
              <Link href="/tasks?filter=all" className="underline">ver</Link>
            </div>
          )}
        </section>

        <section className="bg-white border border-rose-200 bg-rose-50/40 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-rose-900 mb-3">
            Oportunidades paradas ({rottenList.length})
          </h2>
          {rottenList.length === 0 ? (
            <div className="text-xs text-rose-800 italic">Nenhuma oportunidade estagnada.</div>
          ) : (
            <ul className="space-y-1.5">
              {rottenList.slice(0, 5).map((o) => (
                <li key={o.id} className="text-xs flex items-center justify-between gap-2">
                  <Link href={`/opportunities/${o.id}`} className="truncate text-rose-900 hover:underline">
                    {o.municipalityName ?? `#${o.id}`}
                  </Link>
                  <span className="text-rose-700 whitespace-nowrap">
                    {o.lastActivityAt ? new Date(o.lastActivityAt).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </li>
              ))}
              {rottenList.length > 5 && (
                <li className="text-xs">
                  <Link href="/opportunities" className="text-rose-800 underline">
                    Ver todas →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Últimas oportunidades</h2>
          {recent.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Nenhuma ainda.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between">
                  <Link href={`/opportunities/${o.id}`} className="text-sm text-i10-700 hover:underline">
                    {o.municipalityName ?? `Oport. #${o.id}`}
                  </Link>
                  <StageBadge stage={o.stage as StageKey} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Atividades recentes</h2>
          {recentActivity.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Sem atividades registradas.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentActivity.map((a) => (
                <li key={a.id} className="py-2">
                  <Link href={`/opportunities/${a.opportunityId}`} className="text-sm text-slate-700 hover:text-i10-700">
                    {a.subject ?? a.type}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {a.occurredAt ? new Date(a.occurredAt).toLocaleString('pt-BR') : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Card className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle>Funil — por estágio</CardTitle>
          <Link href="/pipeline" className="text-xs font-semibold text-cyan-700 hover:text-cyan-800">
            Ver Kanban completo →
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {funnel.map((f) => (
            <Link key={f.key} href="/pipeline" className="group block">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: 'var(--i10-navy)' }}>
                  {f.label}
                </span>
                <span className="text-slate-500">
                  {f.count} · {brl(f.weighted)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full transition-all group-hover:brightness-110"
                  style={{
                    width: `${Math.max(4, Math.round((f.weighted / maxW) * 100))}%`,
                    background: stageAccentColor(f.color),
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
