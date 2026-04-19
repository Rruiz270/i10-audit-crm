import Link from 'next/link';
import { opportunitiesByStage } from '@/lib/actions/opportunities';
import { listTasksForOpportunity } from '@/lib/actions/tasks';
import { listStages } from '@/lib/actions/stages';
import { getMyPreferences } from '@/lib/actions/me';
import { requireUser } from '@/lib/session';
import { KanbanBoard } from '@/components/kanban-board';
import { getConsultoriaSignalsBatch } from '@/lib/bncc-signals';
import { STAGES } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const [user, params, prefs, stages] = await Promise.all([
    requireUser(),
    searchParams,
    (async () => {
      const u = await requireUser();
      return getMyPreferences(u.id);
    })(),
    listStages(),
  ]);

  // Resolve filtro: URL param tem precedência, senão usa a preferência padrão
  const mine =
    params.mine === '1' || params.mine === 'true'
      ? true
      : params.mine === '0' || params.mine === 'false'
        ? false
        : prefs.defaultPipelineFilter === 'mine';

  const rows = await opportunitiesByStage(mine ? { ownerId: user.id } : undefined);

  // Para cards "ganhou" já transferidos, busca sinais do BNCC em lote.
  const handedOff = rows.filter((r) => r.handedOffConsultoriaId && r.stage === 'ganhou');
  const signalsMap = handedOff.length
    ? await getConsultoriaSignalsBatch(
        handedOff.map((r) => ({
          consultoriaId: r.handedOffConsultoriaId,
          municipalityId: r.municipalityId,
        })),
      )
    : {};

  // Tasks count per opportunity (overdue + upcoming) para alerta SLA nos cards.
  // nowMs snapshot único para todas as linhas — satisfaz react-hooks/purity.
  const nowMs = new Date().getTime();
  const taskSummaries: Record<number, { open: number; overdue: number; nextDue: string | null }> = {};
  await Promise.all(
    rows.map(async (r) => {
      const ts = await listTasksForOpportunity(r.id);
      const open = ts.filter((t) => !t.completedAt);
      const overdue = open.filter((t) => new Date(t.dueAt).getTime() < nowMs).length;
      const nextDue = open
        .map((t) => new Date(t.dueAt).getTime())
        .filter((ms) => ms >= nowMs)
        .sort((a, b) => a - b)[0];
      taskSummaries[r.id] = {
        open: open.length,
        overdue,
        nextDue: nextDue ? new Date(nextDue).toISOString() : null,
      };
    }),
  );

  const cardsWithExtras = rows.map((r) => ({
    ...r,
    bnccSignals:
      signalsMap[`${r.handedOffConsultoriaId ?? ''}:${r.municipalityId ?? ''}`] ?? null,
    taskSummary: taskSummaries[r.id],
  }));

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="i10-eyebrow mb-1">Pipeline · Arraste para mover</div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
            Funil de captação{mine && ' · minhas'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Regras de qualificação aplicadas no drop · Sinais do BNCC-CAPTACAO em tempo real nos cards ganhos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Toggle minhas vs todas */}
          <div className="inline-flex rounded-md overflow-hidden border border-slate-200 bg-white text-xs font-semibold">
            <Link
              href="/pipeline?mine=0"
              className={`px-3 py-1.5 transition-colors ${
                !mine ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={!mine ? { background: 'var(--i10-navy)' } : undefined}
            >
              Todas
            </Link>
            <Link
              href="/pipeline?mine=1"
              className={`px-3 py-1.5 transition-colors ${
                mine ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={mine ? { background: 'var(--i10-navy)' } : undefined}
            >
              Minhas
            </Link>
          </div>
          <div className="text-xs text-slate-500 text-right">
            {rows.length} oportunidade{rows.length === 1 ? '' : 's'} no funil
            {handedOff.length > 0 && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--i10-cyan-dark)' }}>
                {handedOff.length} em execução (BNCC)
              </div>
            )}
          </div>
        </div>
      </header>

      <KanbanBoard cards={cardsWithExtras} stages={stages} />

      <div className="mt-8 text-xs text-slate-400">
        Estágios terminais: {STAGES.filter((s) => s.isTerminal).map((s) => s.label).join(' · ')} ·
        {' '}Para mover para <strong>Perdido</strong>, use a página da oportunidade (motivo obrigatório).
      </div>
    </div>
  );
}
