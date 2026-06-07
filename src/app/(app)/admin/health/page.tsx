import Link from 'next/link';
import { and, count, desc, eq, isNull, lte } from 'drizzle-orm';
import { isAdmin, requireUser } from '@/lib/session';
import { RestrictedGate } from '@/components/restricted-gate';
import { db } from '@/lib/db';
import {
  contacts,
  fundebMunicipalities,
  leadSubmissions,
  opportunities,
  tasks,
  users,
} from '@/lib/schema';
import { ACTIVE_STAGES } from '@/lib/pipeline';
import { isRotten } from '@/lib/forecast';
import { getConsultoriaSignalsBatch } from '@/lib/bncc-signals';
import { listConsultoriasByKickoffWindow } from '@/lib/actions/handoff';
import { KpiTile, type Tone } from '@/components/ui/kpi-tile';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    return (
      <RestrictedGate
        required="admin / gestor"
        currentRole={user.role}
        section="saúde operacional"
      />
    );
  }

  // Referência de "agora" — usada nas queries e nos badges de dias.
  const nowDate = new Date();
  const nowMs = nowDate.getTime();

  // Coletas em paralelo
  const [
    untriagedLeads,
    opsNoContact,
    opsNoOwner,
    overdueTasks,
    staleOps,
    activeConsultorias,
  ] = await Promise.all([
    db
      .select({
        id: leadSubmissions.id,
        payload: leadSubmissions.payload,
        submittedAt: leadSubmissions.submittedAt,
      })
      .from(leadSubmissions)
      .where(eq(leadSubmissions.triaged, false))
      .orderBy(desc(leadSubmissions.submittedAt))
      .limit(50),
    db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        municipalityName: fundebMunicipalities.nome,
      })
      .from(opportunities)
      .leftJoin(
        fundebMunicipalities,
        eq(opportunities.municipalityId, fundebMunicipalities.id),
      )
      .leftJoin(contacts, eq(contacts.opportunityId, opportunities.id))
      .where(and(isNull(contacts.id)))
      .limit(50),
    db
      .select({ n: count() })
      .from(opportunities)
      .where(isNull(opportunities.ownerId)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        assignedTo: tasks.assignedTo,
        assigneeName: users.name,
        opportunityId: tasks.opportunityId,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .where(and(isNull(tasks.completedAt), lte(tasks.dueAt, nowDate)))
      .orderBy(tasks.dueAt)
      .limit(50),
    db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        lastActivityAt: opportunities.lastActivityAt,
        municipalityName: fundebMunicipalities.nome,
        ownerId: opportunities.ownerId,
        ownerName: users.name,
      })
      .from(opportunities)
      .leftJoin(
        fundebMunicipalities,
        eq(opportunities.municipalityId, fundebMunicipalities.id),
      )
      .leftJoin(users, eq(opportunities.ownerId, users.id)),
    listConsultoriasByKickoffWindow({}),
  ]);

  const rottenOps = staleOps.filter(
    (o) =>
      ACTIVE_STAGES.some((s) => s.key === o.stage) &&
      isRotten({ stage: o.stage, lastActivityAt: o.lastActivityAt }),
  );

  // Sinais BNCC pra cada consultoria
  const signalsMap = activeConsultorias.length
    ? await getConsultoriaSignalsBatch(
        activeConsultorias.map((c) => ({
          consultoriaId: c.consultoriaId,
          municipalityId: null,
        })),
      )
    : {};
  const silentConsultorias = activeConsultorias.filter((c) => {
    const s = signalsMap[`${c.consultoriaId ?? ''}:`];
    if (!s) return false;
    return (
      s.reportsCount === 0 &&
      s.actionPlansTotal === 0 &&
      s.evidencesCount === 0 &&
      s.scenariosCount === 0
    );
  });

  const noOwnerCount = Number(opsNoOwner[0]?.n ?? 0);

  type Metric = {
    label: string;
    count: number;
    href: string;
    hint: string;
    tone: Tone;
    icon: string;
    bad: boolean;
  };

  const metrics: Metric[] = [
    {
      label: 'Leads não triados',
      count: untriagedLeads.length,
      href: '/leads',
      hint: 'Submissões públicas aguardando 1º contato.',
      icon: 'inbox',
      bad: untriagedLeads.length > 0,
      tone: untriagedLeads.length > 0 ? 'amber' : 'mint',
    },
    {
      label: 'Oportunidades sem contato',
      count: opsNoContact.length,
      href: '/opportunities',
      hint: 'Não podem avançar de "Novo" sem contato principal (canAdvance guarda).',
      icon: 'user',
      bad: opsNoContact.length > 0,
      tone: opsNoContact.length > 0 ? 'amber' : 'mint',
    },
    {
      label: 'Oportunidades sem dono',
      count: noOwnerCount,
      href: '/opportunities',
      hint: 'Precisam de atribuição. Considere usar bulk reassign.',
      icon: 'flag',
      bad: noOwnerCount > 0,
      tone: noOwnerCount > 0 ? 'rose' : 'mint',
    },
    {
      label: 'Tarefas atrasadas (time todo)',
      count: overdueTasks.length,
      href: '/tasks?filter=all',
      hint: 'Vencidas e ainda abertas.',
      icon: 'clock',
      bad: overdueTasks.length > 0,
      tone: overdueTasks.length > 0 ? 'rose' : 'mint',
    },
    {
      label: 'Oportunidades paradas',
      count: rottenOps.length,
      href: '/pipeline',
      hint: 'Sem atividade há mais tempo que o rot_days do estágio.',
      icon: 'alert-triangle',
      bad: rottenOps.length > 0,
      tone: rottenOps.length > 0 ? 'amber' : 'mint',
    },
    {
      label: 'Consultorias BNCC sem sinal',
      count: silentConsultorias.length,
      href: '/reports',
      hint: 'Handoff feito mas nenhum relatório/plano/evidência no outro sistema.',
      icon: 'activity',
      bad: silentConsultorias.length > 0,
      tone: silentConsultorias.length > 0 ? 'rose' : 'mint',
    },
  ];

  const allHealthy = metrics.every((m) => !m.bad);
  const daysAgo = (d: Date | null) =>
    d ? Math.max(0, Math.floor((nowMs - new Date(d).getTime()) / 86_400_000)) : null;

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8">
        <div className="i10-eyebrow mb-2">Administração · Saúde</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Saúde operacional
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4 max-w-3xl"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '15px' }}
        >
          Radar de problemas silenciosos. Se tudo estiver verde, o funil está
          saudável. Qualquer contador amarelo/vermelho pede atenção do time.
        </p>
      </header>

      {allHealthy && (
        <section
          className="mb-8 flex items-center gap-4 rounded-2xl border border-i10-mint/40 bg-i10-mint-wash p-5"
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-i10-mint-dark">
            <Icon name="check" size={26} />
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: 'var(--i10-navy)' }}>
              Operação saudável
            </div>
            <div className="text-sm text-i10-mint-dark">
              Nenhum sinal de atenção nos seis indicadores. O funil está fluindo.
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {metrics.map((m) => (
          <KpiTile
            key={m.label}
            href={m.href}
            icon={m.icon}
            tone={m.tone}
            value={m.count}
            label={m.label}
            badge={m.bad ? { text: 'ação', tone: m.tone } : undefined}
          />
        ))}
      </section>

      {rottenOps.length > 0 && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Top {Math.min(rottenOps.length, 10)} oportunidades mais paradas
          </h2>
          <ul className="space-y-2">
            {rottenOps.slice(0, 10).map((o) => {
              const d = daysAgo(o.lastActivityAt);
              return (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/opportunities/${o.id}`}
                      className="font-medium text-slate-900 hover:text-[var(--i10-navy)]"
                    >
                      {o.municipalityName ?? `#${o.id}`}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {o.stage} · {o.ownerName ?? 'sem dono'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    {d != null ? `parada ${d}d` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {overdueTasks.length > 0 && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            {overdueTasks.length} tarefa{overdueTasks.length === 1 ? '' : 's'} atrasada{overdueTasks.length === 1 ? '' : 's'}
          </h2>
          <ul className="space-y-2">
            {overdueTasks.slice(0, 10).map((t) => {
              const d = daysAgo(t.dueAt);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/opportunities/${t.opportunityId}`}
                      className="truncate font-medium text-slate-900 hover:text-[var(--i10-navy)]"
                    >
                      {t.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {t.assigneeName ?? 'sem responsável'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                    {d != null ? `venceu há ${d}d` : new Date(t.dueAt).toLocaleDateString('pt-BR')}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
