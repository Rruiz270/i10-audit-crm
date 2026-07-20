import { Skeleton } from '@/components/ui/skeleton';

/** Loading do pipeline — header + colunas do kanban com cards fantasma. */
export default function PipelineLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden p-6 pb-2">
      <header className="mb-4 flex shrink-0 items-start justify-between gap-4 flex-wrap">
        <div>
          <Skeleton className="mb-2 h-3 w-48" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </header>

      <div className="flex flex-1 gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, col) => (
          <div
            key={col}
            className="flex w-64 shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3"
          >
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 3 }).map((_, card) => (
              <Skeleton key={card} className="h-24 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
