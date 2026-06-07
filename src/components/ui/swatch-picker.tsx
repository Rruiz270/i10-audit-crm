'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SwatchOption = {
  /** chave da cor (ex.: slate/cyan/mint/amber/rose/violet/navy) */
  key: string;
  /** hex ou var() usado no preenchimento do círculo */
  color: string;
  label?: string;
};

/**
 * SwatchPicker — círculos de cor selecionáveis (ring no selecionado) + um
 * <input hidden name> para forms/server actions. Substitui os <select> de
 * classe-crua em stages-manager/tags-manager.
 */
export function SwatchPicker({
  name,
  value,
  options,
  className,
}: {
  name: string;
  value?: string;
  options: SwatchOption[];
  className?: string;
}) {
  const [selected, setSelected] = React.useState(value ?? options[0]?.key);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <input type="hidden" name={name} value={selected} />
      {options.map((opt) => {
        const active = opt.key === selected;
        return (
          <button
            key={opt.key}
            type="button"
            title={opt.label ?? opt.key}
            aria-label={opt.label ?? opt.key}
            aria-pressed={active}
            onClick={() => setSelected(opt.key)}
            className={cn(
              'h-7 w-7 rounded-full border border-black/5 transition',
              active
                ? 'ring-2 ring-offset-2 ring-i10-cyan'
                : 'hover:scale-110',
            )}
            style={{ background: opt.color }}
          />
        );
      })}
    </div>
  );
}
