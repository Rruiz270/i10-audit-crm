'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { KANBAN_STAGES, type StageKey } from '@/lib/pipeline';
import { changeStage } from '@/lib/actions/opportunities';
import { isRotten, daysUntilRot, weightedValue } from '@/lib/forecast';
import type { BnccSignals } from '@/lib/bncc-signals';
import { signalsToBadges } from '@/lib/bncc-signals';
import { BnccBadges } from '@/components/bncc-badges';
import { stageAccentColor } from '@/components/ui/stage-badge';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';

/** Estágio dinâmico (vindo do DB) — compatível com `StageDefinition` do TS. */
export type DynamicStage = {
  key: string;
  label: string;
  description: string | null;
  color: string;
  order: number;
  probability: number;
  rotDays: number | null;
  isTerminal: boolean;
  isWon: boolean;
};

export type KanbanCard = {
  id: number;
  stage: string;
  estimatedValue: number | null;
  closeDate: Date | null;
  municipalityId: number | null;
  municipalityName: string | null;
  ownerId?: string | null;
  ownerName: string | null;
  stageUpdatedAt: Date | null;
  lastActivityAt: Date | null;
  tags: string[] | null;
  handedOffConsultoriaId?: number | null;
  bnccSignals?: BnccSignals | null;
  taskSummary?: { open: number; overdue: number; nextDue: string | null };
};

export function KanbanBoard({
  cards,
  stages,
}: {
  cards: KanbanCard[];
  /**
   * Estágios a renderizar. Se não passado, usa `KANBAN_STAGES` (defaults do TS).
   * Passar custom stages (vindos de crm.pipeline_stages) habilita colunas extras.
   */
  stages?: DynamicStage[];
}) {
  const renderStages = React.useMemo<DynamicStage[]>(() => {
    if (stages && stages.length > 0) {
      return stages.filter((s) => s.key !== 'perdido');
    }
    return KANBAN_STAGES.map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description ?? null,
      color: s.color,
      order: s.order,
      probability: s.probability,
      rotDays: s.rotDays,
      isTerminal: s.isTerminal,
      isWon: s.isWon,
    }));
  }, [stages]);
  const router = useRouter();
  const [local, setLocal] = React.useState<Record<number, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const withLocalStage = cards.map((c) => ({
    ...c,
    stage: (local[c.id] ?? c.stage) as StageKey,
  }));

  const byStage = React.useMemo(() => {
    const map: Record<string, typeof withLocalStage> = {};
    for (const s of renderStages) map[s.key] = [];
    for (const c of withLocalStage) {
      if (map[c.stage]) map[c.stage].push(c);
    }
    return map;
  }, [withLocalStage, renderStages]);

  async function onDragEnd(e: DragEndEvent) {
    setErr(null);
    setMissing([]);
    if (!e.over) return;
    const cardId = Number(e.active.id);
    const toStage = String(e.over.id) as StageKey;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.stage === toStage) return;
    if (toStage === 'perdido') {
      setErr('Use o painel lateral da oportunidade para registrar perda (precisa de motivo).');
      return;
    }

    // Optimistic
    setLocal((prev) => ({ ...prev, [cardId]: toStage }));
    setBusyId(cardId);
    const res = await changeStage({ opportunityId: cardId, toStage });
    setBusyId(null);
    if (!res.ok) {
      // revert
      setLocal((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setErr(res.error ?? 'Falha ao mover');
      setMissing(res.missing ?? []);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      {err && (
        <div className="mb-4 rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          <div className="font-medium">{err}</div>
          {missing.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {renderStages.map((s) => (
            <Column
              key={s.key}
              stageDef={s}
              cards={byStage[s.key] ?? []}
              busyId={busyId}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  stageDef,
  cards,
  busyId,
}: {
  stageDef: DynamicStage;
  cards: KanbanCard[];
  busyId: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageDef.key });
  const def = stageDef;
  const value = cards.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0);
  const weighted = weightedValue(
    cards.map((c) => ({ stage: c.stage, estimatedValue: c.estimatedValue })),
  );

  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 w-72 bg-white border rounded-xl transition-colors ${
        isOver ? 'border-i10-400 ring-2 ring-i10-200' : 'border-slate-200'
      }`}
    >
      {/* border-t-${def.color} nunca era gerado pelo Tailwind v4 (JIT não vê a
          classe dinâmica) → cor sólida via style inline mapeada do estágio. */}
      <div
        className="px-4 py-3 border-b border-slate-200 rounded-t-xl"
        style={{ borderTop: `4px solid ${stageAccentColor(def.color)}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--i10-navy)' }}>
              {def.label}
            </span>
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
              {cards.length}
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400" title="Probabilidade de fechamento">
            {Math.round(def.probability * 100)}%
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--i10-navy)' }}>
            {value > 0
              ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
              : '—'}
          </span>
          {weighted > 0 && (
            <span title="Valor ponderado (× probabilidade)" className="text-[11px] text-slate-400 font-mono">
              ≈ {weighted.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>
      <div className="p-2 min-h-[400px] space-y-2">
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} busy={busyId === c.id} />
        ))}
        {cards.length === 0 && (
          <div className="text-xs text-slate-400 italic text-center py-10">arraste aqui</div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card, busy }: { card: KanbanCard; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : {};

  const forecastOp = { stage: card.stage, lastActivityAt: card.lastActivityAt };
  const rotten = isRotten(forecastOp);
  const remaining = daysUntilRot(forecastOp);

  // ── ONE status chip por card (prioridade: parada > vence) ──
  let statusChip: React.ReactNode = null;
  if (card.taskSummary && card.taskSummary.overdue > 0) {
    statusChip = (
      <Chip tone="rose">
        <Icon name="alert-triangle" size={11} />
        {card.taskSummary.overdue} tarefa{card.taskSummary.overdue > 1 ? 's' : ''} atrasada{card.taskSummary.overdue > 1 ? 's' : ''}
      </Chip>
    );
  } else if (rotten) {
    statusChip = (
      <Chip tone="rose">
        <Icon name="clock" size={11} />
        Parada {remaining != null && remaining < 0 ? `${-remaining}d` : 'há muito'}
      </Chip>
    );
  } else if (remaining != null && remaining <= 2 && remaining >= 0) {
    statusChip = (
      <Chip tone="amber">
        <Icon name="clock" size={11} />
        Vence {remaining}d
      </Chip>
    );
  }

  const bnccBadges = card.bnccSignals ? signalsToBadges(card.bnccSignals) : [];
  const tags = card.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const overflowTags = tags.slice(2);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing ${
        rotten ? 'border-rose-300 ring-1 ring-rose-100' : isDragging ? 'border-i10-400 shadow-md' : 'border-slate-200'
      } ${busy ? 'opacity-50' : ''}`}
    >
      {/* Zona 1 — título + #id */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/opportunities/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-semibold hover:underline truncate"
          style={{ color: 'var(--i10-navy)' }}
        >
          {card.municipalityName ?? `Oport. #${card.id}`}
        </Link>
        <span className="shrink-0 text-[11px] text-slate-400">#{card.id}</span>
      </div>

      {/* Zona 2 — dono · valor */}
      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
        <span className="truncate">{card.ownerName ?? '—'}</span>
        <span className="shrink-0 font-mono">
          {card.estimatedValue != null
            ? card.estimatedValue.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              })
            : '—'}
        </span>
      </div>

      {/* Zona 3 — UM chip de status + sinais BNCC + tags (overflow em popover) */}
      {(statusChip || bnccBadges.length > 0 || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {statusChip}
          {bnccBadges.length > 0 && <BnccBadges signals={bnccBadges.slice(0, 2)} variant="sm" />}
          {visibleTags.map((t) => (
            <Chip key={t} tone="slate">
              {t}
            </Chip>
          ))}
          {overflowTags.length > 0 && (
            <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <Popover
                align="start"
                triggerClassName="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200"
                trigger={`+${overflowTags.length}`}
                panelClassName="w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
              >
                <div className="flex flex-wrap gap-1">
                  {overflowTags.map((t) => (
                    <Chip key={t} tone="slate">
                      {t}
                    </Chip>
                  ))}
                </div>
              </Popover>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
