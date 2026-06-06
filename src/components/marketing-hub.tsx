import Link from 'next/link';
import type { ReactNode } from 'react';

// Ícones SVG inline (estilo lucide) — sem emojis, na cor da marca i10.
const ICON_PATHS: Record<string, ReactNode> = {
  msg: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />,
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  mega: (
    <>
      <path d="m3 11 16-5v12L3 14z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      <path d="M19 9v4" />
    </>
  ),
  chart: (
    <>
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="8" />
      <line x1="18" y1="20" x2="18" y2="4" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

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
