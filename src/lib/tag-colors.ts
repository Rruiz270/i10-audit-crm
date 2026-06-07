/**
 * Cores de tag — client-safe (sem imports de server). Mapeia o `color` da
 * taxonomia (crm.tags.color) para estilos de chip alinhados ao brandbook i10
 * (navy/cyan/mint/emerald). Tags fora da taxonomia caem no fallback "slate".
 */

import type * as React from 'react';

export const TAG_COLOR_OPTS = [
  'slate',
  'navy',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'emerald',
  'amber',
  'rose',
  'pink',
] as const;

export type TagColor = (typeof TAG_COLOR_OPTS)[number];

const PALETTE: Record<string, { bg: string; color: string }> = {
  slate: { bg: '#F1F5F9', color: '#334155' },
  navy: { bg: 'rgba(11,31,59,0.10)', color: 'var(--i10-navy)' },
  cyan: { bg: 'rgba(0,180,216,0.15)', color: 'var(--i10-cyan-dark)' },
  blue: { bg: '#DBEAFE', color: '#1E40AF' },
  indigo: { bg: '#E0E7FF', color: '#3730A3' },
  violet: { bg: '#EDE9FE', color: '#5B21B6' },
  emerald: { bg: '#D1FAE5', color: '#065F46' },
  amber: { bg: '#FEF3C7', color: '#92400E' },
  rose: { bg: '#FFE4E6', color: '#9F1239' },
  pink: { bg: '#FCE7F3', color: '#9D174D' },
};

export function tagChipStyle(color: string | null | undefined): React.CSSProperties {
  const c = PALETTE[color ?? 'slate'] ?? PALETTE.slate;
  return { background: c.bg, color: c.color };
}
