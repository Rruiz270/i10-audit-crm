import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

/**
 * Paleta de tons compartilhada (wash de fundo + texto) alinhada ao brandbook
 * i10. Usada por KpiTile, Chip e demais componentes da fundação.
 */
export type Tone = 'navy' | 'mint' | 'cyan' | 'amber' | 'rose' | 'violet' | 'slate';

export const TONE_WASH: Record<Tone, string> = {
  navy: 'bg-i10-navy-pale text-i10-navy',
  mint: 'bg-i10-mint-wash text-i10-mint-dark',
  cyan: 'bg-i10-cyan-wash text-i10-cyan-dark',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function KpiTile({
  icon,
  value,
  label,
  tone = 'navy',
  badge,
  href,
}: {
  icon?: string;
  value: ReactNode;
  label: string;
  tone?: Tone;
  badge?: { text: string; tone?: Tone };
  href?: string;
}) {
  const badgeTone = TONE_WASH[badge?.tone ?? 'mint'];
  const inner = (
    <>
      {badge && (
        <span
          className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badgeTone}`}
        >
          {badge.text}
        </span>
      )}
      {icon && (
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${TONE_WASH[tone]}`}>
          <Icon name={icon} size={22} />
        </div>
      )}
      <div
        className={`text-2xl font-extrabold tracking-tight sm:text-3xl ${icon ? 'mt-3' : ''}`}
        style={{ color: 'var(--i10-navy)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </>
  );

  const base = 'relative block rounded-xl border border-slate-200 bg-white p-4';

  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
