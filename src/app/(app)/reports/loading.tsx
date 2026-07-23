import { Skeleton } from '@/components/ui/skeleton';

/** Loading de relatórios — header + seletor de janela + KPIs + painéis. */
export default function ReportsLoading() {
  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Skeleton className="mb-3 h-3 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-9 w-40" />
      </header>

      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section}>
            <Skeleton className="mb-2 h-3 w-36" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
