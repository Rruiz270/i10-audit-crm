import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { listAllTasks, listOverdueTasks } from '@/lib/actions/tasks';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

const PRIO_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-rose-50 text-rose-700',
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filter = params.filter ?? 'mine';

  const [myTasks, overdue] = await Promise.all([
    listAllTasks(filter === 'mine' ? { mine: user.id } : {}),
    listOverdueTasks(),
  ]);
  // Snapshot de "now" fora do map para satisfazer react-hooks/purity — comparamos
  // todas as linhas contra o mesmo instante em vez de ler o relógio por linha.
  const now = new Date();

  const tasks = myTasks;
  const openOnly = tasks.filter((t) => !t.completedAt);

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tarefas</h1>
          <p className="text-sm text-slate-500 mt-1">
            {openOnly.length} em aberto · {overdue.length} atrasada{overdue.length === 1 ? '' : 's'} (time todo)
          </p>
        </div>
        <nav className="flex gap-2 text-xs">
          <Link
            href="/tasks?filter=mine"
            className={`px-3 py-1.5 rounded ${filter === 'mine' ? 'bg-i10-50 text-i10-700 font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Minhas
          </Link>
          <Link
            href="/tasks?filter=all"
            className={`px-3 py-1.5 rounded ${filter !== 'mine' ? 'bg-i10-50 text-i10-700 font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Todas
          </Link>
        </nav>
      </header>

      {overdue.length > 0 && filter !== 'mine' && (
        <section className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h2 className="text-xs font-semibold text-rose-800 uppercase tracking-wide mb-2">
            {overdue.length} atrasada{overdue.length === 1 ? '' : 's'}
          </h2>
          <ul className="space-y-1">
            {overdue.slice(0, 10).map((t) => (
              <li key={t.id} className="text-sm text-rose-900 flex items-center justify-between">
                <span>
                  <Link href={`/opportunities/${t.opportunityId}`} className="underline">
                    #{t.opportunityId}
                  </Link>{' '}
                  — {t.title} <span className="text-xs text-rose-600">({fmtDate(t.dueAt)})</span>
                </span>
                <span className="text-xs text-rose-700">{t.assigneeName ?? 'sem dono'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500 italic">
          {filter === 'mine'
            ? 'Sem tarefas pra você.'
            : 'Ninguém tem tarefas no momento.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Título</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Vence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Oportunidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Prioridade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => {
                const overdueRow =
                  !t.completedAt && new Date(t.dueAt).getTime() < now.getTime();
                return (
                  <tr key={t.id} className={overdueRow ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3">
                      <div className={`text-sm ${t.completedAt ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {t.title}
                      </div>
                      {t.completedAt && (
                        <div className="text-xs text-slate-400">Concluída em {fmtDate(t.completedAt)}</div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${overdueRow ? 'text-rose-700 font-medium' : 'text-slate-600'}`}>
                      {fmtDate(t.dueAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/opportunities/${t.opportunityId}`} className="text-i10-700 hover:underline">
                        {t.municipalityName ?? `#${t.opportunityId}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${PRIO_STYLE[t.priority] ?? PRIO_STYLE.normal}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{t.assigneeName ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
