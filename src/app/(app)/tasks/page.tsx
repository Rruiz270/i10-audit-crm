import { requireUser } from '@/lib/session';
import { getTaskKpis, listTasksForBoard } from '@/lib/actions/tasks';
import { listOpportunities, listUsersForAssignment } from '@/lib/actions/opportunities';
import { KpiTile } from '@/components/ui/kpi-tile';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TasksBoard, type BoardTask } from '@/components/tasks-board';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filter = params.filter === 'all' ? 'all' : 'mine';
  const scope = filter === 'mine' ? { mine: user.id } : {};

  const [tasks, kpis, opportunities, users] = await Promise.all([
    listTasksForBoard(scope),
    getTaskKpis(scope),
    listOpportunities(),
    listUsersForAssignment(),
  ]);

  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
            Operação
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Tarefas
          </h1>
        </div>
        <SegmentedControl
          value={filter}
          options={[
            { value: 'mine', label: 'Minhas', href: '/tasks?filter=mine' },
            { value: 'all', label: 'Todas', href: '/tasks?filter=all' },
          ]}
        />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon="check-square" tone="navy" value={kpis.open} label="Em aberto" />
        <KpiTile
          icon="alert-triangle"
          tone="rose"
          value={kpis.overdue}
          label="Atrasadas"
          badge={kpis.overdue > 0 ? { text: 'ação', tone: 'rose' } : undefined}
        />
        <KpiTile icon="clock" tone="amber" value={kpis.today} label="Vencem hoje" />
        <KpiTile icon="check" tone="mint" value={kpis.done7} label="Concluídas (7d)" />
      </div>

      <TasksBoard
        tasks={tasks as BoardTask[]}
        opportunities={opportunities.map((o) => ({ id: o.id, municipalityName: o.municipalityName }))}
        users={users}
      />
    </div>
  );
}
