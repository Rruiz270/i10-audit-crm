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
} from '@/lib/schema';
import { ACTIVE_STAGES } from '@/lib/pipeline';
import { isRotten } from '@/lib/forecast';
import { getConsultoriaSignalsBatch } from '@/lib/bncc-signals';
import { listConsultoriasByKickoffWindow } from '@/lib/actions/handoff';

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
        opportunityId: tasks.opportunityId,
      })
      .from(tasks)
      .where(and(isNull(tasks.completedAt), lte(tasks.dueAt, new Date())))
      .orderBy(tasks.dueAt)
      .limit(50),
    db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        lastActivityAt: opportunities.lastActivityAt,
        municipalityName: fundebMunicipalities.nome,
        ownerId: opportunities.ownerId,
      })
      .from(opportunities)
      .leftJoin(
        fundebMunicipalities,
        eq(opportunities.municipalityId, fundebMunicipalities.id),
      ),
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

  const sections = [
    {
      label: 'Leads não triados',
      count: untriagedLeads.length,
      href: '/leads',
      hint: 'Submissões públicas aguardando 1º contato.',
      tone: untriagedLeads.length > 0 ? 'amber' : 'ok',
    },
    {
      label: 'Oportunidades sem contato',
      count: opsNoContact.length,
      href: '/opportunities',
      hint: 'Não podem avançar de "Novo" sem contato principal (canAdvance guarda).',
      tone: opsNoContact.length > 0 ? 'amber' : 'ok',
    },
    {
      label: 'Oportunidades sem dono',
      count: Number(opsNoOwner[0]?.n ?? 0),
      href: '/opportunities',
      hint: 'Precisam de atribuição. Considere usar bulk reassign.',
      tone: Number(opsNoOwner[0]?.n ?? 0) > 0 ? 'rose' : 'ok',
    },
    {
      label: 'Tarefas atrasadas (time todo)',
      count: overdueTasks.length,
      href: '/tasks?filter=all',
      hint: 'Vencidas e ainda abertas.',
      tone: overdueTasks.length > 0 ? 'rose' : 'ok',
    },
    {
      label: 'Oportunidades paradas',
      count: rottenOps.length,
      href: '/pipeline',
      hint: 'Sem atividade há mais tempo que o rot_days do estágio.',
      tone: rottenOps.length > 0 ? 'amber' : 'ok',
    },
    {
      label: 'Consultorias BNCC sem sinal',
      count: silentConsultorias.length,
      href: '/reports',
      hint: 'Handoff feito mas nenhum relatório/plano/evidência no outro sistema.',
      tone: silentConsultorias.length > 0 ? 'rose' : 'ok',
    },
  ];

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

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {sections.map((s) => {
          const toneBg =
            s.tone === 'rose'
              ? 'bg-rose-50 border-rose-200'
              : s.tone === 'amber'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200';
          const toneText =
            s.tone === 'rose'
              ? 'text-rose-900'
              : s.tone === 'amber'
                ? 'text-amber-900'
                : 'text-emerald-900';
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`block rounded-lg border p-5 transition-colors hover:shadow-sm ${toneBg}`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wider ${toneText}`}>
                {s.label}
              </div>
              <div className={`text-3xl font-extrabold mt-2 ${toneText}`}>{s.count}</div>
              <div className={`text-xs mt-2 ${toneText} opacity-80`}>{s.hint}</div>
            </Link>
          );
        })}
      </section>

      {rottenOps.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            Top {Math.min(rottenOps.length, 10)} oportunidades mais paradas
          </h2>
          <ul className="divide-y divide-slate-100">
            {rottenOps.slice(0, 10).map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                <Link
                  href={`/opportunities/${o.id}`}
                  className="text-slate-900 hover:text-[var(--i10-navy)]"
                >
                  {o.municipalityName ?? `#${o.id}`}
                </Link>
                <span className="text-xs text-slate-500">
                  {o.stage} ·{' '}
                  {o.lastActivityAt
                    ? new Date(o.lastActivityAt).toLocaleDateString('pt-BR')
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overdueTasks.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            {overdueTasks.length} tarefa{overdueTasks.length === 1 ? '' : 's'} atrasada{overdueTasks.length === 1 ? '' : 's'}
          </h2>
          <ul className="divide-y divide-slate-100">
            {overdueTasks.slice(0, 10).map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                <Link
                  href={`/opportunities/${t.opportunityId}`}
                  className="text-slate-900 hover:text-[var(--i10-navy)] truncate"
                >
                  {t.title}
                </Link>
                <span className="text-xs text-rose-700">
                  {new Date(t.dueAt).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
