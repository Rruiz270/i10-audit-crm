import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading do dashboard (e fallback das rotas do grupo sem loading próprio).
 * Espelha o layout real: header, 5 KPIs, painel "meu pipeline" e 2 colunas de cards.
 */
export default function DashboardLoading() {
  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8">
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </section>

      <Skeleton className="mb-6 h-44 rounded-xl" />

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Skeleton className="h-36 rounded-lg" />
        <Skeleton className="h-36 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
