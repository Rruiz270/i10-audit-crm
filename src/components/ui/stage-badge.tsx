import { STAGES_BY_KEY, type StageKey } from '@/lib/pipeline';

/**
 * Esquema do badge aderente ao brandbook i10.
 * Estágios iniciais → cinzas / navy-pale; meio → cyan (cor secundária da marca);
 * fechamento positivo → mint; negativo → coral sistema.
 */
const STYLE: Record<string, { bg: string; fg: string; ring: string }> = {
  'slate-500': { bg: '#F1F5F9', fg: '#1E293B', ring: '#CBD5E1' },
  'blue-500': { bg: '#d6e0f5', fg: '#0A2463', ring: '#91A8DB' },
  'indigo-500': { bg: '#CAF0F8', fg: '#0A2463', ring: '#ADE8F4' },
  'violet-500': { bg: '#ADE8F4', fg: '#0A2463', ring: '#48CAE4' },
  'amber-500': { bg: '#E0FFF5', fg: '#00C48A', ring: '#B7F5E0' },
  'orange-500': { bg: '#B7F5E0', fg: '#00C48A', ring: '#00E5A0' },
  'emerald-500': { bg: '#00E5A0', fg: '#061840', ring: '#00C48A' },
  'rose-500': { bg: '#FEE2E2', fg: '#B91C1C', ring: '#FECACA' },
};

export function StageBadge({ stage }: { stage: StageKey }) {
  const def = STAGES_BY_KEY[stage];
  if (!def) return <span className="text-xs text-slate-500">{stage}</span>;
  const s = STYLE[def.color] ?? STYLE['slate-500'];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1"
      style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      {def.label}
    </span>
  );
}
