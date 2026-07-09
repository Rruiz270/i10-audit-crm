'use client';

import * as React from 'react';
import {
  KanbanBoard,
  type KanbanCard,
  type DynamicStage,
  type TeamUser,
  type Viewer,
} from '@/components/kanban-board';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/input';
import { isRotten } from '@/lib/forecast';

/**
 * Barra de filtros client-side do Pipeline (dono + "só paradas"), aplicada
 * sobre os cards antes de renderizar o KanbanBoard. Presentacional — não muda
 * data fetching nem o comportamento de drag-and-drop. O toggle Todas/Minhas
 * continua URL-driven na page (server), porque controla o que vem do DB.
 */
export function PipelineFilters({
  cards,
  stages,
  team,
  viewer,
}: {
  cards: KanbanCard[];
  stages?: DynamicStage[];
  team?: TeamUser[];
  viewer?: Viewer;
}) {
  const [owner, setOwner] = React.useState('');
  const [onlyRotten, setOnlyRotten] = React.useState(false);
  // Uma leitura de relógio por render — coerente com isRotten dos cards.
  const [now] = React.useState(() => new Date());

  const owners = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cards) {
      if (c.ownerId) map.set(c.ownerId, c.ownerName ?? c.ownerId);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const filtered = React.useMemo(
    () =>
      cards.filter((c) => {
        if (owner && c.ownerId !== owner) return false;
        if (onlyRotten && !isRotten({ stage: c.stage, lastActivityAt: c.lastActivityAt }, now)) {
          return false;
        }
        return true;
      }),
    [cards, owner, onlyRotten, now],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="w-auto text-xs py-1.5"
          aria-label="Filtrar por dono"
        >
          <option value="">Todos os donos</option>
          {owners.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
          <Switch checked={onlyRotten} onChange={setOnlyRotten} />
          Só paradas
        </label>
      </div>
      <KanbanBoard cards={filtered} stages={stages} team={team} viewer={viewer} />
    </div>
  );
}
