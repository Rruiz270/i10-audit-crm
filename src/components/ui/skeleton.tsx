import { cn } from '@/lib/utils';

/**
 * Bloco de skeleton para estados de loading (loading.tsx das rotas).
 * Server-safe (sem 'use client'). Dimensione via className.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} />;
}
