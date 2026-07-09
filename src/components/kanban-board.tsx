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
import { changeStage, claimOpportunity, reassignOpportunity } from '@/lib/actions/opportunities';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';
import { PRODUCTS, PRODUCT_POSVENDA, type Product } from '@/lib/products';
import { isAdmin } from '@/lib/roles';
import { isRotten, daysUntilRot, weightedValue } from '@/lib/forecast';
import type { BnccSignals } from '@/lib/bncc-signals';
import { signalsToBadges } from '@/lib/bncc-signals';
import { BnccBadges } from '@/components/bncc-badges';
import { stageAccentColor } from '@/components/ui/stage-badge';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';

export type TeamUser = { id: string; name: string | null; email: string; role: string };
export type Viewer = { id: string; role: string };

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
  products?: string[] | null;
  notes?: string | null;
  activeNo?: number | null;
  handedOffConsultoriaId?: number | null;
  bnccSignals?: BnccSignals | null;
  taskSummary?: { open: number; overdue: number; nextDue: string | null };
  primaryContact?: {
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    marketingContactId: number | null;
  } | null;
};

export function KanbanBoard({
  cards,
  stages,
  team,
  viewer,
}: {
  cards: KanbanCard[];
  /**
   * Estágios a renderizar. Se não passado, usa `KANBAN_STAGES` (defaults do TS).
   * Passar custom stages (vindos de crm.pipeline_stages) habilita colunas extras.
   */
  stages?: DynamicStage[];
  team?: TeamUser[];
  viewer?: Viewer;
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
  // Popup de Ganho: arrastar para "ganhou" abre a seleção de produto(s) —
  // obrigatório; é o que ramifica o pós-venda e o funil por produto.
  const [wonFor, setWonFor] = React.useState<KanbanCard | null>(null);
  const [wonSel, setWonSel] = React.useState<string[]>([]);
  const [prodFilter, setProdFilter] = React.useState<string>('all');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const withLocalStage = cards
    .filter(
      (c) =>
        prodFilter === 'all' ||
        (c.products ?? []).includes(prodFilter) ||
        (c.tags ?? []).some((t) => t.toLowerCase() === prodFilter.toLowerCase()),
    )
    .map((c) => ({
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
    if (toStage === 'ganhou' && !(card.products ?? []).length) {
      setWonFor(card);
      setWonSel([]);
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

  async function confirmWon() {
    if (!wonFor || wonSel.length === 0) return;
    const cardId = wonFor.id;
    setWonFor(null);
    setLocal((prev) => ({ ...prev, [cardId]: 'ganhou' }));
    setBusyId(cardId);
    const res = await changeStage({ opportunityId: cardId, toStage: 'ganhou', products: wonSel });
    setBusyId(null);
    if (!res.ok) {
      setLocal((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setErr(res.error ?? 'Falha ao registrar o ganho');
      setMissing(res.missing ?? []);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      {wonFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/55 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWonFor(null);
          }}
        >
          <div className="mt-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--i10-navy)' }}>
              🎉 {wonFor.municipalityName ?? `Oportunidade #${wonFor.id}`} — Ganhou!
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Quais produtos fecharam? <b>Obrigatório</b> — cada produto dispara o pós-venda certo.
            </p>
            <div className="mt-4 space-y-2">
              {PRODUCTS.map((p) => {
                const on = wonSel.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm transition ${
                      on ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-cyan-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setWonSel((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))
                      }
                      className="mt-0.5 accent-emerald-600"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">{p}</span>
                      <span className="block text-xs text-slate-500">
                        {PRODUCT_POSVENDA[p as Product]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setWonFor(null)}
                className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmWon}
                disabled={wonSel.length === 0}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirmar ganho ✓
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Produto
        </span>
        {['all', ...PRODUCTS].map((p) => (
          <button
            key={p}
            onClick={() => setProdFilter(p)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              prodFilter === p
                ? 'border-i10-700 bg-i10-700 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-400'
            }`}
          >
            {p === 'all' ? 'Todos' : p}
          </button>
        ))}
      </div>

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

      <DndContext id="pipeline-dnd" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {renderStages.map((s) => (
            <Column
              key={s.key}
              stageDef={s}
              cards={byStage[s.key] ?? []}
              busyId={busyId}
              team={team}
              viewer={viewer}
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
  team,
  viewer,
}: {
  stageDef: DynamicStage;
  cards: KanbanCard[];
  busyId: number | null;
  team?: TeamUser[];
  viewer?: Viewer;
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
          <DraggableCard key={c.id} card={c} busy={busyId === c.id} team={team} viewer={viewer} />
        ))}
        {cards.length === 0 && (
          <div className="text-xs text-slate-400 italic text-center py-10">arraste aqui</div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  card,
  busy,
  team,
  viewer,
}: {
  card: KanbanCard;
  busy: boolean;
  team?: TeamUser[];
  viewer?: Viewer;
}) {
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
  // Esconde tags-marcador técnicas (ex.: import-jun2026) da UI.
  const tags = (card.tags ?? []).filter((t) => !/^import-/i.test(t));
  const visibleTags = tags.slice(0, 2);
  const overflowTags = tags.slice(2);
  // Tooltip no hover: todas as tags + descrição (notes), quando houver.
  const hoverSummary = [
    tags.length > 1 ? `Tags: ${tags.join(' · ')}` : '',
    card.notes ? `Descrição: ${card.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      ref={setNodeRef}
      style={style}
      title={hoverSummary || undefined}
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
        {card.activeNo != null ? (
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white"
            style={{ background: 'var(--i10-cyan-dark, #0e7490)' }}
            title={`Lead ativo nº ${card.activeNo}`}
          >
            #{String(card.activeNo).padStart(3, '0')}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-slate-400">#{card.id}</span>
        )}
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

      {/* Zona 2.5 — dono: dropdown (admin/gestor) ou "pegar" (consultor no pool) */}
      {viewer && <CardOwner card={card} team={team ?? []} viewer={viewer} />}

      {/* Zona 2.7 — contato principal + ações rápidas 💬 ✉️ 📞 */}
      {card.primaryContact && (
        <div
          className="mt-2 flex items-center gap-1.5 border-t border-dashed border-slate-100 pt-2 text-xs text-slate-500"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {card.primaryContact.marketingContactId ? (
            <Link
              href={`/contacts/${card.primaryContact.marketingContactId}`}
              className="min-w-0 truncate font-medium text-slate-700 hover:text-i10-700 hover:underline"
              title="Abrir Ficha 360 do contato"
            >
              {card.primaryContact.name}
            </Link>
          ) : (
            <span className="min-w-0 truncate font-medium text-slate-700">{card.primaryContact.name}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {card.primaryContact.marketingContactId &&
            (card.primaryContact.whatsapp || card.primaryContact.phone) ? (
              <form action={startConversationWithContact} className="inline-flex">
                <input
                  type="hidden"
                  name="contactId"
                  value={card.primaryContact.marketingContactId}
                />
                <button
                  type="submit"
                  className="text-emerald-600 hover:text-emerald-700"
                  title="WhatsApp — abrir/iniciar conversa"
                >
                  <Icon name="msg" size={14} />
                </button>
              </form>
            ) : (
              <span className="text-slate-300" title="Sem WhatsApp">
                <Icon name="msg" size={14} />
              </span>
            )}
            {card.primaryContact.email ? (
              <a
                href={`mailto:${card.primaryContact.email}`}
                className="text-sky-600 hover:text-sky-700"
                title={card.primaryContact.email}
              >
                <Icon name="mail" size={14} />
              </a>
            ) : (
              <span className="text-slate-300" title="Sem e-mail">
                <Icon name="mail" size={14} />
              </span>
            )}
            {card.primaryContact.phone || card.primaryContact.whatsapp ? (
              <a
                href={`tel:${(card.primaryContact.whatsapp ?? card.primaryContact.phone ?? '').replace(/[^+\d]/g, '')}`}
                className="text-slate-500 hover:text-slate-700"
                title="Ligar"
              >
                <Icon name="phone" size={14} />
              </a>
            ) : (
              <span className="text-slate-300" title="Sem telefone">
                <Icon name="phone" size={14} />
              </span>
            )}
          </span>
        </div>
      )}

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

/**
 * Controle de dono direto no card do funil.
 *  - admin/gestor: dropdown para definir/transferir o dono (qualquer consultor).
 *  - consultor: botão "Pegar" quando o lead está no pool (sem dono).
 * stopPropagation evita que o clique/seleção dispare o drag-and-drop.
 */
function CardOwner({
  card,
  team,
  viewer,
}: {
  card: KanbanCard;
  team: TeamUser[];
  viewer: Viewer;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const admin = isAdmin(viewer.role);
  const inPool = !card.ownerId;
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  async function claim(e: React.MouseEvent) {
    e.stopPropagation();
    setPending(true);
    const fd = new FormData();
    fd.set('id', String(card.id));
    await claimOpportunity(fd);
    setPending(false);
    router.refresh();
  }

  async function assign(e: React.ChangeEvent<HTMLSelectElement>) {
    const ownerId = e.target.value;
    setPending(true);
    const fd = new FormData();
    fd.set('id', String(card.id));
    fd.set('ownerId', ownerId);
    await reassignOpportunity(fd);
    setPending(false);
    router.refresh();
  }

  if (admin) {
    return (
      <div className="mt-2" {...stop}>
        <select
          value={card.ownerId ?? ''}
          onChange={assign}
          disabled={pending}
          aria-label="Dono do lead"
          className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 focus:border-i10-400 focus:outline-none"
        >
          <option value="">— sem dono (pool) —</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
              {u.role !== 'consultor' ? ` · ${u.role}` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (inPool) {
    return (
      <div className="mt-2" {...stop}>
        <button
          onClick={claim}
          disabled={pending}
          className="w-full rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--i10-navy)' }}
        >
          {pending ? 'Assumindo…' : '✋ Pegar este lead'}
        </button>
      </div>
    );
  }

  if (card.ownerId === viewer.id) {
    return <div className="mt-1.5 text-[11px] font-medium text-emerald-600">Você é o dono</div>;
  }
  return null;
}
