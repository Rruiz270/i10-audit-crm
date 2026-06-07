import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

// Re-export do Icon compartilhado para manter a API pública existente
// (callsites importam `Icon` de '@/components/marketing-hub').
export { Icon };

type Tone = 'wa' | 'em' | 'cv' | 'ld' | 'neutral';
const TONE_BG: Record<Tone, string> = {
  wa: 'bg-emerald-100 text-emerald-700',
  em: 'bg-sky-100 text-sky-700',
  cv: 'bg-emerald-100 text-emerald-700',
  ld: 'bg-violet-100 text-violet-700',
  neutral: 'bg-slate-100 text-slate-600',
};

export function HubTile({
  href,
  icon,
  tone = 'neutral',
  title,
  metric,
  sub,
  action,
  badge,
  isNew,
}: {
  href: string;
  icon: string;
  tone?: Tone;
  title: string;
  metric: ReactNode;
  sub: string;
  action: string;
  badge?: { text: string; tone: 'amber' | 'mint' | 'rose' };
  isNew?: boolean;
}) {
  const badgeCls =
    badge?.tone === 'amber'
      ? 'bg-amber-100 text-amber-800'
      : badge?.tone === 'rose'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-emerald-100 text-emerald-700';
  return (
    <Link
      href={href}
      className="relative block rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg"
    >
      {badge && (
        <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badgeCls}`}>
          {badge.text}
        </span>
      )}
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_BG[tone]}`}>
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mt-3 flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--i10-navy)' }}>
        {title}
        {isNew && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">NOVO</span>
        )}
      </h3>
      <div className="mt-1.5 text-3xl font-extrabold tracking-tight" style={{ color: 'var(--i10-navy)' }}>
        {metric}
      </div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
      <div className="mt-3 text-[12.5px] font-semibold text-cyan-700">{action} →</div>
    </Link>
  );
}
