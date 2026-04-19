import { cn } from '@/lib/utils';

/**
 * Wordmark oficial i10 — segue o brandbook (nav-logo-text): "i" em navy/branco,
 * "10" em cyan (#00B4D8). Preso a `font-extrabold tracking-tight`.
 */
export function Wordmark({
  tone = 'dark',
  size = 'md',
  className,
}: {
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizeClass =
    size === 'sm'
      ? 'text-xl'
      : size === 'lg'
        ? 'text-5xl'
        : size === 'xl'
          ? 'text-7xl'
          : 'text-3xl';

  return (
    <span className={cn('font-extrabold tracking-tight leading-none', sizeClass, className)}>
      <span style={{ color: tone === 'light' ? '#FFFFFF' : 'var(--i10-navy)' }}>i</span>
      <span style={{ color: 'var(--i10-cyan)' }}>10</span>
    </span>
  );
}

export function WordmarkWithTagline({
  tagline = 'Audit CRM',
  className,
}: {
  tagline?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <Wordmark size="md" />
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
        style={{ letterSpacing: '3px' }}
      >
        {tagline}
      </span>
    </div>
  );
}
