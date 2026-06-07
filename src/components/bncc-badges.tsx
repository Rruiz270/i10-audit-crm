import type { SignalBadge } from '@/lib/bncc-signals';

/**
 * BnccBadges — renderiza os sinais do BNCC-CAPTACAO. Extraído da lógica
 * duplicada em kanban-board.tsx e opportunities/[id]/page.tsx.
 *
 * Duas variantes, com cores idênticas às originais:
 *  - `sm` (default): pills compactos sobre fundo claro (cards do kanban),
 *    fundos pale, texto navy-dark (rose → vermelho).
 *  - `lg`: badges maiores sobre fundo NAVY escuro (página da oportunidade),
 *    fundos vívidos, texto branco (mint/cyan → navy-dark).
 */
export function BnccBadges({
  signals,
  variant = 'sm',
}: {
  signals: SignalBadge[];
  variant?: 'sm' | 'lg';
}) {
  if (signals.length === 0) return null;

  if (variant === 'lg') {
    return (
      <div className="flex flex-wrap gap-2">
        {signals.map((b) => (
          <span
            key={b.label}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{
              background:
                b.tone === 'mint'
                  ? 'var(--i10-mint)'
                  : b.tone === 'cyan'
                    ? 'var(--i10-cyan)'
                    : b.tone === 'rose'
                      ? '#F87171'
                      : b.tone === 'amber'
                        ? '#F59E0B'
                        : 'rgba(255,255,255,0.15)',
              color:
                b.tone === 'mint' || b.tone === 'cyan'
                  ? 'var(--i10-navy-dark)'
                  : '#FFFFFF',
            }}
          >
            {b.icon && <span>{b.icon}</span>}
            {b.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {signals.map((b) => (
        <span
          key={b.label}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background:
              b.tone === 'mint'
                ? 'var(--i10-mint)'
                : b.tone === 'cyan'
                  ? 'var(--i10-cyan-pale)'
                  : b.tone === 'rose'
                    ? '#FEE2E2'
                    : b.tone === 'amber'
                      ? '#FEF3C7'
                      : 'var(--i10-navy-pale)',
            color: b.tone === 'rose' ? '#B91C1C' : 'var(--i10-navy-dark)',
          }}
        >
          {b.icon && <span>{b.icon}</span>}
          {b.label}
        </span>
      ))}
    </div>
  );
}
