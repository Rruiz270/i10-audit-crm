'use client';

import * as React from 'react';
import { Icon } from '@/components/ui/icon';

/**
 * Casca client de abas para a página de detalhe da oportunidade.
 *
 * IMPORTANTE: é puramente presentacional. Os painéis são renderizados no
 * SERVER (forms + server actions intactos) e passados como ReactNode em
 * `tabs[].panel`. Trocar de aba só alterna `display` — nenhum form é
 * desmontado nem perde estado de submit. Cada painel fica montado o tempo
 * todo (escondido com `hidden`) para preservar comportamento de forms
 * não-controlados.
 */
export type OpportunityTab = {
  key: string;
  label: string;
  icon?: string;
  count?: number;
  panel: React.ReactNode;
};

export function OpportunityTabs({ tabs }: { tabs: OpportunityTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.key);

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm border-b-2 transition ${
                on
                  ? 'border-i10-mint font-semibold text-i10-navy'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon && <Icon name={t.icon} size={15} />}
              {t.label}
              {t.count != null && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-5">
        {tabs.map((t) => (
          <div key={t.key} role="tabpanel" hidden={t.key !== active}>
            {t.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
