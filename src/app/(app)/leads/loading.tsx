import { Skeleton } from '@/components/ui/skeleton';

/** Loading de leads — header + filtros laterais + cards de submissão. */
export default function LeadsLoading() {
  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-8 w-56" />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
