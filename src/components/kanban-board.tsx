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

type Card = {
  id: number;
  stage: string;
  estimatedValue: number | null;
  closeDate: Date | null;
  municipalityId: number | null;
  municipalityName: string | null;
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
  cards: Card[];
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
  cards: Card[];
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
      className={`shrink-0 w-72 bg-white border rounded-lg transition-colors ${
        isOver ? 'border-i10-400 ring-2 ring-i10-200' : 'border-slate-200'
      }`}
    >
      <div className={`px-4 py-3 border-b border-slate-200 border-t-4 rounded-t-lg border-t-${def.color}`}>
        <div className="flex items-center justify-between">
          <div className="font-medium text-slate-900 text-sm">{def.label}</div>
          <div className="text-xs text-slate-500">
            {cards.length} · <span title="Probabilidade de fechamento">{Math.round(def.probability * 100)}%</span>
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-0.5 flex items-center justify-between">
          <span>{value > 0 ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—'}</span>
          {weighted > 0 && (
            <span title="Valor ponderado (× probabilidade)" className="text-slate-500 font-mono">
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

function DraggableCard({ card, busy }: { card: Card; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : {};

  const forecastOp = { stage: card.stage, lastActivityAt: card.lastActivityAt };
  const rotten = isRotten(forecastOp);
  const remaining = daysUntilRot(forecastOp);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing ${
        rotten ? 'border-rose-300 ring-1 ring-rose-100' : isDragging ? 'border-i10-400 shadow-md' : 'border-slate-200'
      } ${busy ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between">
        <Link
          href={`/opportunities/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-medium text-slate-900 hover:text-i10-700 truncate"
        >
          {card.municipalityName ?? `Oport. #${card.id}`}
        </Link>
        <span className="text-xs text-slate-400">#{card.id}</span>
      </div>

      {(card.tags?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {card.tags!.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
            >
              {t}
            </span>
          ))}
          {card.tags!.length > 3 && (
            <span className="text-[10px] text-slate-400">+{card.tags!.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
        <span>{card.ownerName ?? '—'}</span>
        {card.estimatedValue != null && (
          <span className="font-mono">
            {card.estimatedValue.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            })}
          </span>
        )}
      </div>

      {/* Task SLA alert — destaca se há tarefa atrasada ou vencendo */}
      {card.taskSummary && card.taskSummary.overdue > 0 && (
        <div className="mt-1.5 text-[11px] text-rose-700 font-semibold">
          ⏰ {card.taskSummary.overdue} tarefa{card.taskSummary.overdue > 1 ? 's' : ''} atrasada{card.taskSummary.overdue > 1 ? 's' : ''}
        </div>
      )}
      {card.taskSummary && card.taskSummary.overdue === 0 && card.taskSummary.nextDue && (
        <div className="mt-1.5 text-[11px] text-slate-500">
          Próxima tarefa: {new Date(card.taskSummary.nextDue).toLocaleDateString('pt-BR')}
        </div>
      )}

      {/* BNCC signals nos cards "ganhou" já transferidos */}
      {card.bnccSignals && (() => {
        const badges = signalsToBadges(card.bnccSignals).slice(0, 3);
        if (badges.length === 0) {
          return (
            <div className="mt-1.5 text-[11px] text-slate-400 italic">
              BNCC: aguardando 1º sinal
            </div>
          );
        }
        return (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
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
                  color:
                    b.tone === 'rose' ? '#B91C1C' : 'var(--i10-navy-dark)',
                }}
              >
                {b.icon && <span>{b.icon}</span>}
                {b.label}
              </span>
            ))}
          </div>
        );
      })()}

      {rotten && (
        <div className="mt-1.5 text-[11px] text-rose-700 flex items-center gap-1" title="Sem atividade há muito tempo">
          <span>🕑</span>
          <span>Parada há {remaining != null && remaining < 0 ? `${-remaining}d` : 'muito'}</span>
        </div>
      )}
      {!rotten && remaining != null && remaining <= 2 && remaining >= 0 && (
        <div className="mt-1.5 text-[11px] text-amber-700">
          Vence em {remaining}d — registre progresso
        </div>
      )}
    </div>
  );
}
