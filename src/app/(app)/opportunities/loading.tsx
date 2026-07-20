import { Skeleton } from '@/components/ui/skeleton';

/** Loading de oportunidades — header + facetas laterais + linhas da lista. */
export default function OpportunitiesLoading() {
  return (
    <div className="px-8 py-8 max-w-7xl">
      <header className="mb-6">
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-8 w-64" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
