'use client';

import * as React from 'react';
import { Icon } from '@/components/ui/icon';

/**
 * Disclosure "Opções avançadas". O conteúdo permanece SEMPRE montado (apenas
 * escondido com `hidden`), então qualquer input dentro continua no DOM do form
 * e é submetido normalmente pela server action — diferente de um Popover, que
 * desmontaria o painel ao fechar.
 */
export function AdvancedOptions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <Icon name="settings" size={14} />
        Opções avançadas
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <Icon name="arrow-right" size={12} />
        </span>
      </button>
      <div hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  );
}
