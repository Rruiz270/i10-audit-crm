import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { tagChipStyle } from '@/lib/tag-colors';
import { TONE_WASH, type Tone } from '@/components/ui/kpi-tile';

/**
 * Chip / pill genérico usando a paleta de tons compartilhada. Server-safe.
 */
export function Chip({
  tone = 'slate',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_WASH[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * StatusChip — mapeia status comuns (active/unsubscribed/bounced/complained…)
 * para tons. Default fallback = slate.
 */
const STATUS_TONE: Record<string, Tone> = {
  active: 'mint',
  unsubscribed: 'slate',
  bounced: 'rose',
  complained: 'amber',
};

export function StatusChip({
  status,
  label,
  className,
}: {
  status: string;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <Chip tone={STATUS_TONE[status] ?? 'slate'} className={className}>
      {label ?? status}
    </Chip>
  );
}

/**
 * TagChip — wrapper fino sobre `tagChipStyle` (cor da taxonomia crm.tags.color).
 * Usa style inline (hex/var) em vez da paleta de classes, para casar 1:1 com
 * as cores de tag existentes.
 */
export function TagChip({
  color,
  children,
  className,
}: {
  color: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={tagChipStyle(color)}
    >
      {children}
    </span>
  );
}
