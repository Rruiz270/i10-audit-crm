'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SegOption = {
  value: string;
  label: React.ReactNode;
  href?: string;
};

/**
 * SegmentedControl — controle de abas/filtros pill-style. Suporta dois modos:
 *
 *  1. Controlado (cliente): passe `value` + `onChange`.
 *  2. Link (URL-driven): passe options com `href`; o item ativo é o que casa
 *     com `value` (ex.: derivado dos searchParams).
 *
 * 'use client' é necessário pelo handler onClick do modo controlado; o modo
 * link funciona igual em árvore server (Link é client mas o wrapper renderiza
 * no server tranquilamente quando importado de um server component).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const cls = cn(
          'rounded-md px-3 py-1.5 text-sm font-medium transition',
          active
            ? 'bg-white text-i10-navy shadow-sm'
            : 'text-slate-500 hover:text-slate-700',
        );
        if (opt.href) {
          return (
            <Link
              key={opt.value}
              href={opt.href}
              role="tab"
              aria-selected={active}
              className={cls}
            >
              {opt.label}
            </Link>
          );
        }
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(opt.value)}
            className={cls}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
