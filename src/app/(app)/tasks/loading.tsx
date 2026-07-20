import { Skeleton } from '@/components/ui/skeleton';

/** Loading de tarefas — header + 4 KPIs + colunas do board. */
export default function TasksLoading() {
  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="rounded-xl border border-slate-200 bg-white p-3">
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, card) => (
                <Skeleton key={card} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
