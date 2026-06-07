import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card composável — substitui o padrão repetido
 * `bg-white border border-slate-200 rounded-xl p-...`.
 * Server-safe (sem 'use client'). Aceita className para sobrescrever padding/etc.
 */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn('text-[15px] font-semibold', className)}
      style={{ color: 'var(--i10-navy)' }}
    >
      {children}
    </h3>
  );
}
