import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpportunity, listUsersForAssignment } from '@/lib/actions/opportunities';
import { listTasksForOpportunity } from '@/lib/actions/tasks';
import { getConsultoriaFor } from '@/lib/actions/handoff';
import { getConsultoriaSignals, signalsToBadges } from '@/lib/bncc-signals';
import { allMunicipalities } from '@/lib/municipalities';
import { StageBadge } from '@/components/ui/stage-badge';
import { Button } from '@/components/ui/button';
import { ContactForm } from '@/components/contact-form';
import { ActivityForm } from '@/components/activity-form';
import { StageControl } from '@/components/stage-control';
import { OpportunityEditForm } from '@/components/opportunity-edit-form';
import { HandoffButton } from '@/components/handoff-button';
import { MeetingForm } from '@/components/meeting-form';
import { TasksPanel } from '@/components/tasks-panel';
import { TagEditor } from '@/components/tag-editor';
import { setPrimaryContact, deleteContact } from '@/lib/actions/contacts';
import { STAGES_BY_KEY, type StageKey } from '@/lib/pipeline';
import { isRotten, daysUntilRot } from '@/lib/forecast';
import { LOST_REASONS_BY_CODE, type LostReasonCode } from '@/lib/lost-reasons';

export const dynamic = 'force-dynamic';

function formatMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(d: Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}
function formatDateTime(d: Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

/**
 * Badge de kickoff que muda de cor conforme a distância pro início:
 *   · futuro >7d  → cyan claro "Kickoff em Xd"
 *   · esta semana → mint "Kickoff em Xd"
 *   · passou mas dentro da vigência → neutro "Consultoria ativa"
 *   · prazo vencido → amber "Finaliza em Xd" ou rose "Vencida"
 */
function KickoffBadge({
  startDate,
  endDate,
  now,
}: {
  startDate: Date | string | null;
  endDate: Date | string | null;
  now: number;
}) {
  if (!startDate) {
    return <span className="text-xs text-white/70">Sem data de kickoff</span>;
  }
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : null;
  const daysToStart = Math.round((start - now) / (24 * 3600_000));

  if (daysToStart > 7) {
    return (
      <div
        className="inline-flex flex-col items-end px-3 py-1.5 rounded-md text-xs font-semibold"
        style={{ background: 'rgba(0,180,216,0.15)', color: 'var(--i10-cyan-light)' }}
      >
        <span>Kickoff em {daysToStart}d</span>
      </div>
    );
  }
  if (daysToStart > 0) {
    return (
      <div
        className="inline-flex flex-col items-end px-3 py-1.5 rounded-md text-xs font-semibold"
        style={{ background: 'var(--i10-mint)', color: 'var(--i10-navy-dark)' }}
      >
        <span>Kickoff em {daysToStart}d (esta semana)</span>
      </div>
    );
  }
  if (daysToStart === 0) {
    return (
      <div
        className="inline-flex flex-col items-end px-3 py-1.5 rounded-md text-xs font-semibold"
        style={{ background: 'var(--i10-mint)', color: 'var(--i10-navy-dark)' }}
      >
        <span>Kickoff é hoje 🚀</span>
      </div>
    );
  }
  // daysToStart < 0 — já começou
  if (end == null) {
    return (
      <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-md bg-white/10 text-white text-xs font-semibold">
        <span>Ativa há {-daysToStart}d</span>
      </div>
    );
  }
  const daysToEnd = Math.round((end - now) / (24 * 3600_000));
  if (daysToEnd < 0) {
    return (
      <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-md bg-rose-500/90 text-white text-xs font-semibold">
        <span>Vencida há {-daysToEnd}d</span>
      </div>
    );
  }
  if (daysToEnd < 30) {
    return (
      <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-md bg-amber-500/90 text-white text-xs font-semibold">
        <span>Finaliza em {daysToEnd}d</span>
      </div>
    );
  }
  return (
    <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-md bg-white/10 text-white text-xs font-semibold">
      <span>Ativa · {daysToEnd}d restantes</span>
    </div>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  note: 'Nota',
  call: 'Ligação',
  email: 'Email',
  whatsapp: 'WhatsApp',
  stage_change: 'Mudança de estágio',
  diagnostic_sent: 'Diagnóstico enviado',
  proposal_sent: 'Proposta enviada',
  contract_signed: 'Contrato assinado',
  handoff: 'Handoff BNCC-CAPTACAO',
  intake_submission: 'Formulário público',
  lost: 'Perda registrada',
};

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opId = Number(id);
  if (!Number.isFinite(opId)) notFound();

  const op = await getOpportunity(opId);
  if (!op) notFound();

  const [municipalities, opTasks, teamUsers, consultoria] = await Promise.all([
    allMunicipalities(),
    listTasksForOpportunity(opId),
    listUsersForAssignment(),
    getConsultoriaFor(opId),
  ]);
  const bnccSignals = consultoria?.consultoriaId
    ? await getConsultoriaSignals(
        consultoria.consultoriaId,
        consultoria.municipalityId,
      )
    : null;
  const bnccBadges = bnccSignals ? signalsToBadges(bnccSignals) : [];

  const rotten = isRotten({
    stage: op.stage as string,
    lastActivityAt: op.lastActivityAt,
  });
  const remaining = daysUntilRot({
    stage: op.stage as string,
    lastActivityAt: op.lastActivityAt,
  });
  const stageDef = STAGES_BY_KEY[op.stage as StageKey];
  const lostReasonInfo =
    op.lostReasonCode && LOST_REASONS_BY_CODE[op.lostReasonCode as LostReasonCode];
  // Single clock read for the whole page — satisfies react-hooks/purity.
  const nowMs = new Date().getTime();

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6">
        <Link href="/opportunities" className="text-xs text-slate-500 hover:text-i10-700">
          ← Oportunidades
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {op.municipalityName ?? 'Sem município'}
              </h1>
              <StageBadge stage={op.stage as StageKey} />
              <span className="text-xs text-slate-400">#{op.id}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Dono: {op.ownerName ?? '—'} · Fonte: {op.source ?? '—'}
              {' · '}Probabilidade {stageDef ? `${Math.round(stageDef.probability * 100)}%` : '—'}
              {op.handedOffAt && ' · Já transferida para BNCC-CAPTACAO'}
            </p>
            {rotten && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                🕑 Oportunidade parada — sem atividade há {remaining != null ? `${-remaining}d` : 'muito tempo'}. Registre progresso.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {op.stage === 'ganhou' && !op.handedOffConsultoriaId && (
              <HandoffButton
                opportunityId={op.id}
                suggestedSecretary={
                  op.contacts.find((c) => c.isPrimary)?.name ?? null
                }
              />
            )}
            {op.handedOffConsultoriaId && (
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold"
                style={{
                  background: 'var(--i10-mint)',
                  color: 'var(--i10-navy-dark)',
                }}
              >
                ✓ Consultoria #{op.handedOffConsultoriaId} criada
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Card de consultoria — aparece quando a oportunidade já foi transferida */}
      {consultoria?.consultoriaId && (
        <section
          className="mb-6 rounded-xl p-5 text-white"
          style={{ background: 'var(--i10-gradient-main)' }}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <div
                className="text-[11px] font-bold uppercase"
                style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
              >
                Consultoria FUNDEB ativa · BNCC-CAPTACAO
              </div>
              <div className="mt-2 text-xl font-bold">
                {consultoria.municipalityName ?? '—'}{' '}
                <span className="font-normal opacity-70">· #{consultoria.consultoriaId}</span>
              </div>
              <div className="mt-1 text-sm text-white/80">
                Handshake realizado em{' '}
                {consultoria.handedOffAt
                  ? new Date(consultoria.handedOffAt).toLocaleString('pt-BR')
                  : '—'}
              </div>
            </div>
            <div className="text-right">
              <KickoffBadge startDate={consultoria.startDate} endDate={consultoria.endDate} now={nowMs} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-white/60 uppercase tracking-wider">Status</div>
              <div className="mt-0.5 font-semibold text-white">
                {consultoria.status ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-white/60 uppercase tracking-wider">Início (kickoff)</div>
              <div className="mt-0.5 font-semibold text-white">
                {consultoria.startDate
                  ? new Date(consultoria.startDate).toLocaleDateString('pt-BR')
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-white/60 uppercase tracking-wider">Fim previsto</div>
              <div className="mt-0.5 font-semibold text-white">
                {consultoria.endDate
                  ? new Date(consultoria.endDate).toLocaleDateString('pt-BR')
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-white/60 uppercase tracking-wider">Consultor / Secretário</div>
              <div className="mt-0.5 font-semibold text-white truncate">
                {consultoria.consultantName ?? '—'}
              </div>
              {consultoria.secretaryName && (
                <div className="text-white/70 truncate">{consultoria.secretaryName}</div>
              )}
            </div>
          </div>

          {/* ─── Sinais vindos do BNCC-CAPTACAO ─────────────────────────── */}
          {bnccSignals && (
            <div className="mt-5 pt-5 border-t border-white/20">
              <div className="flex items-center justify-between mb-2">
                <div
                  className="text-[11px] font-bold uppercase"
                  style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
                >
                  Sinais do sistema de auditoria
                </div>
                {bnccSignals.lastActivityAt && (
                  <div className="text-[11px] text-white/60">
                    última atividade:{' '}
                    {new Date(bnccSignals.lastActivityAt).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
              {bnccBadges.length === 0 ? (
                <div className="text-xs text-white/60 italic">
                  Nenhuma atividade no BNCC-CAPTACAO ainda. O 1º relatório aparece aqui quando
                  for gerado no outro sistema.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {bnccBadges.map((b) => (
                    <span
                      key={b.label}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
                      style={{
                        background:
                          b.tone === 'mint'
                            ? 'var(--i10-mint)'
                            : b.tone === 'cyan'
                              ? 'var(--i10-cyan)'
                              : b.tone === 'rose'
                                ? '#F87171'
                                : b.tone === 'amber'
                                  ? '#F59E0B'
                                  : 'rgba(255,255,255,0.15)',
                        color:
                          b.tone === 'mint' || b.tone === 'cyan'
                            ? 'var(--i10-navy-dark)'
                            : '#FFFFFF',
                      }}
                    >
                      {b.icon && <span>{b.icon}</span>}
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Valor estimado</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {formatMoney(op.estimatedValue)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Fechamento previsto</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {formatDate(op.closeDate)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Contrato</div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {op.contractSigned ? '✓ Assinado' : 'Pendente'}
              </div>
            </div>
          </div>

          {/* Tasks */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Tarefas ({opTasks.filter((t) => !t.completedAt).length} aberta{opTasks.filter((t) => !t.completedAt).length === 1 ? '' : 's'})
              </h2>
              <span className="text-xs text-slate-400">próxima ação sempre é uma tarefa</span>
            </div>
            <TasksPanel opportunityId={op.id} tasks={opTasks} users={teamUsers} />
          </section>

          {/* Edit */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Dados da oportunidade</h2>
            <OpportunityEditForm
              opportunity={{
                id: op.id,
                municipalityId: op.municipalityId,
                source: op.source,
                estimatedValue: op.estimatedValue,
                closeDate: op.closeDate,
                contractSigned: op.contractSigned,
                contractNotes: op.contractNotes,
                notes: op.notes,
              }}
              municipalities={municipalities}
            />
          </section>

          {/* Contacts */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Contatos ({op.contacts.length})
            </h2>
            {op.contacts.length > 0 && (
              <ul className="divide-y divide-slate-100 mb-6">
                {op.contacts.map((c) => (
                  <li key={c.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {c.name}
                        {c.isPrimary && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-i10-100 text-i10-800">
                            principal
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {c.role ?? '—'}
                        {c.email && ` · ${c.email}`}
                        {c.phone && ` · ${c.phone}`}
                        {c.whatsapp && ` · WA ${c.whatsapp}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!c.isPrimary && (
                        <form action={setPrimaryContact}>
                          <input type="hidden" name="contactId" value={c.id} />
                          <input type="hidden" name="opportunityId" value={op.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Tornar principal
                          </Button>
                        </form>
                      )}
                      <form action={deleteContact}>
                        <input type="hidden" name="contactId" value={c.id} />
                        <input type="hidden" name="opportunityId" value={op.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remover
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <ContactForm opportunityId={op.id} />
          </section>

          {/* Meetings */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Reuniões ({op.meetings.length})
            </h2>
            {op.meetings.length > 0 && (
              <ul className="divide-y divide-slate-100 mb-6">
                {op.meetings.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {m.title ?? 'Reunião'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDateTime(m.scheduledAt)} · {m.kind} · {m.durationMinutes}min
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.meetLink && (
                          <a
                            href={m.meetLink}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-i10-700 hover:underline"
                          >
                            Link →
                          </a>
                        )}
                        {m.googleEventId && (
                          <span className="text-xs text-slate-400" title={m.googleEventId}>
                            ✓ Calendar
                          </span>
                        )}
                      </div>
                    </div>
                    {m.notes && (
                      <div className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">
                        {m.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <MeetingForm opportunityId={op.id} />
          </section>

          {/* Timeline */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Histórico ({op.activities.length})
            </h2>
            <ActivityForm opportunityId={op.id} />
            <div className="mt-6 space-y-3">
              {op.activities.map((a) => (
                <div key={a.id} className="border-l-2 border-slate-200 pl-3 py-1">
                  <div className="text-xs text-slate-500">
                    {ACTIVITY_LABEL[a.type] ?? a.type} · {formatDateTime(a.occurredAt)}
                  </div>
                  {a.subject && (
                    <div className="text-sm font-medium text-slate-900 mt-0.5">{a.subject}</div>
                  )}
                  {a.body && (
                    <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">
                      {a.body}
                    </div>
                  )}
                </div>
              ))}
              {op.activities.length === 0 && (
                <div className="text-xs text-slate-400 italic">Sem atividades registradas.</div>
              )}
            </div>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Estágio
            </h3>
            <StageControl opportunityId={op.id} currentStage={op.stage as StageKey} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Tags
            </h3>
            <TagEditor opportunityId={op.id} initialTags={(op.tags as string[] | null) ?? []} />
          </section>
          <section className="bg-white border border-slate-200 rounded-lg p-5 text-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Metadados
            </h3>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-slate-500">Criada</dt>
                <dd className="text-slate-700">{formatDate(op.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Estágio desde</dt>
                <dd className="text-slate-700">{formatDate(op.stageUpdatedAt)}</dd>
              </div>
              {op.wonAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Ganha em</dt>
                  <dd className="text-emerald-700 font-medium">{formatDate(op.wonAt)}</dd>
                </div>
              )}
              {op.lostAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Perdida em</dt>
                  <dd className="text-rose-700 font-medium">{formatDate(op.lostAt)}</dd>
                </div>
              )}
              {lostReasonInfo && (
                <div className="mt-2 text-slate-700">
                  <div className="font-medium">Motivo: {lostReasonInfo.label}</div>
                  {op.lostReason && op.lostReason !== lostReasonInfo.label && (
                    <div className="italic text-xs mt-0.5">{op.lostReason}</div>
                  )}
                </div>
              )}
              {!lostReasonInfo && op.lostReason && (
                <div className="mt-2 text-slate-700 italic">Motivo: {op.lostReason}</div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
