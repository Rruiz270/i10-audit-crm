import Link from 'next/link';
import { cn } from '@/lib/utils';

export type FacetItem = {
  value: string;
  count: number;
};

/**
 * FacetGroup — grupo de filtro facetado (título + itens com contagem + estado
 * ativo). Link-based (searchParams-driven). Server-safe.
 *
 * O callsite fornece `buildHref(value, isActive)` para montar a URL,
 * preservando sua própria lógica de query-string (toggle on/off etc).
 */
export function FacetGroup({
  title,
  facets,
  active,
  buildHref,
  labelFn,
  className,
}: {
  title: string;
  facets: FacetItem[];
  active: string | number | undefined;
  /** monta o href para um valor; isActive indica se já está selecionado (toggle). */
  buildHref: (value: string, isActive: boolean) => string;
  labelFn?: (value: string) => string;
  className?: string;
}) {
  if (facets.length === 0) return null;
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="space-y-1">
        {facets.map((f) => {
          const isActive = String(active ?? '') === f.value;
          return (
            <Link
              key={f.value}
              href={buildHref(f.value, isActive)}
              className={cn(
                'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                isActive
                  ? 'bg-cyan-50 font-semibold text-cyan-800'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className="truncate">{labelFn ? labelFn(f.value) : f.value}</span>
              <span className="ml-2 shrink-0 text-xs text-slate-400">{f.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
