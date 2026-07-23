import { Skeleton } from '@/components/ui/skeleton';

/** Loading de prospecção — header + KPIs + facetas laterais + tabela ranqueada. */
export default function ProspeccaoLoading() {
  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-8 w-64" />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
