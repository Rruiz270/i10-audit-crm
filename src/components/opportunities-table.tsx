'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StageBadge } from '@/components/ui/stage-badge';
import { Button } from '@/components/ui/button';
import { Select, Input } from '@/components/ui/input';
import { Chip, TagChip } from '@/components/ui/chip';
import { Switch } from '@/components/ui/switch';
import { Popover } from '@/components/ui/popover';
import { Icon } from '@/components/ui/icon';
import { bulkReassign, deleteOpportunityById, bulkDeleteOpportunities } from '@/lib/actions/opportunities';
import { isRotten, daysUntilRot } from '@/lib/forecast';
import type { StageKey } from '@/lib/pipeline';

type Row = {
  id: number;
  stage: string;
  municipalityName: string | null;
  estimatedValue: number | null;
  closeDate: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: Date | null;
  lastActivityAt: Date | null;
  tags: string[] | null;
};

type User = { id: string; name: string | null; email: string; role: string };

function fmtMoney(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

/** Atividade relativa ("hoje", "há 2 dias") a partir de lastActivityAt. */
function relativeActivity(d: Date | null, now: Date): string {
  if (!d) return 'sem atividade';
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / (24 * 3600_000));
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} sem`;
  return `há ${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? 'es' : ''}`;
}

export function OpportunitiesTable({
  rows,
  users,
  canBulk,
  isAdmin,
  tagFilter,
  tagStyles,
}: {
  rows: Row[];
  users: User[];
  canBulk: boolean;
  isAdmin: boolean;
  tagFilter?: string;
  tagStyles?: Record<string, { color: string; category: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [newOwner, setNewOwner] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [onlyRotten, setOnlyRotten] = React.useState(false);
  // One clock read per render — rotten comparison runs on same snapshot.
  const [nowSnapshot] = React.useState(() => new Date());

  async function doDelete(id: number) {
    setDeleting(id);
    const res = await deleteOpportunityById(id);
    setDeleting(null);
    if (res.ok) {
      router.refresh();
    } else {
      setMsg(res.error ?? 'Erro ao excluir');
    }
  }

  async function doBulkDelete() {
    setBusy(true);
    setMsg(null);
    const res = await bulkDeleteOpportunities([...selected]);
    setBusy(false);
    if (res.ok) {
      setMsg(`${res.count} excluída${res.count === 1 ? '' : 's'}`);
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg(res.error ?? 'Erro');
    }
  }

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tagFilter && !(r.tags ?? []).includes(tagFilter)) return false;
      if (onlyRotten && !isRotten({ stage: r.stage, lastActivityAt: r.lastActivityAt }, nowSnapshot)) {
        return false;
      }
      if (q && !(r.municipalityName ?? '').toLowerCase().includes(q) && !String(r.id).includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, tagFilter, onlyRotten, search, nowSnapshot]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === filteredRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRows.map((r) => r.id)));
    }
  }

  async function doBulkReassign() {
    if (!newOwner || selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('ownerId', newOwner);
    fd.set('ids', [...selected].join(','));
    const res = await bulkReassign(fd);
    setBusy(false);
    if (res.ok) {
      setMsg(`${res.count} reatribuída${res.count === 1 ? '' : 's'}`);
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg(res.error ?? 'Erro');
    }
  }

  function MetaPopover({ r }: { r: Row }) {
    return (
      <Popover
        align="end"
        triggerClassName="text-slate-300 hover:text-slate-500"
        trigger={<Icon name="more-horizontal" size={16} />}
        panelClassName="w-52 rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs"
      >
        <dl className="space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-slate-500">ID</dt>
            <dd className="font-mono text-slate-700">#{r.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Criada</dt>
            <dd className="text-slate-700">{fmtDate(r.createdAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Fechamento</dt>
            <dd className="text-slate-700">{fmtDate(r.closeDate)}</dd>
          </div>
        </dl>
      </Popover>
    );
  }

  function DeleteConfirm({ r }: { r: Row }) {
    return (
      <Popover
        align="end"
        triggerClassName="text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
        trigger={
          deleting === r.id ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          ) : (
            <Icon name="trash" size={16} />
          )
        }
        panelClassName="w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      >
        {({ close }) => (
          <div className="text-xs">
            <p className="text-slate-700">
              Excluir <strong>#{r.id}</strong>? Não pode ser desfeito.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  close();
                  doDelete(r.id);
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        )}
      </Popover>
    );
  }

  function StatusCell({ r }: { r: Row }) {
    const rot = isRotten({ stage: r.stage, lastActivityAt: r.lastActivityAt }, nowSnapshot);
    if (rot) {
      const rem = daysUntilRot({ stage: r.stage, lastActivityAt: r.lastActivityAt }, nowSnapshot);
      return (
        <Chip tone="rose">
          <Icon name="clock" size={11} />
          Parada {rem != null && rem < 0 && rem !== -Infinity ? `${-rem}d` : ''}
        </Chip>
      );
    }
    return <span className="text-slate-500">{relativeActivity(r.lastActivityAt, nowSnapshot)}</span>;
  }

  function TagList({ r }: { r: Row }) {
    const tags = r.tags ?? [];
    if (tags.length === 0) return null;
    return (
      <span className="inline-flex flex-wrap gap-1 align-middle">
        {tags.slice(0, 2).map((t) => (
          <TagChip key={t} color={tagStyles?.[t]?.color}>
            {t}
          </TagChip>
        ))}
        {tags.length > 2 && (
          <Popover
            align="start"
            triggerClassName="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200"
            trigger={`+${tags.length - 2}`}
            panelClassName="w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          >
            <div className="flex flex-wrap gap-1">
              {tags.slice(2).map((t) => (
                <TagChip key={t} color={tagStyles?.[t]?.color}>
                  {t}
                </TagChip>
              ))}
            </div>
          </Popover>
        )}
      </span>
    );
  }

  const allSelected = filteredRows.length > 0 && selected.size === filteredRows.length;

  return (
    <div>
      {/* Filtros client-side: busca + "só paradas" */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" size={16} />
          </span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar município ou #id…"
            className="w-64 pl-8 py-1.5 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
          <Switch checked={onlyRotten} onChange={setOnlyRotten} />
          Só paradas
        </label>
      </div>

      {/* Mobile: cards empilhados (< md) */}
      <div className="space-y-2 md:hidden">
        {filteredRows.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm italic text-slate-500">
            Nenhuma oportunidade.{' '}
            <Link href="/opportunities/new" className="text-i10-700 underline">Criar a primeira</Link>.
          </div>
        )}
        {filteredRows.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border bg-white p-3 ${
              isRotten({ stage: r.stage, lastActivityAt: r.lastActivityAt }, nowSnapshot)
                ? 'border-rose-200'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <Link href={`/opportunities/${r.id}`} className="font-semibold hover:underline" style={{ color: 'var(--i10-navy)' }}>
                {r.municipalityName ?? '(sem município)'}
              </Link>
              <StageBadge stage={r.stage as StageKey} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>{r.ownerName ?? '—'} · {fmtMoney(r.estimatedValue)}</span>
              <StatusCell r={r} />
            </div>
            <div className="mt-1.5"><TagList r={r} /></div>
          </div>
        ))}
      </div>

      {/* Desktop: tabela enxuta (>= md) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {canBulk && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4"
                    aria-label="Selecionar tudo"
                  />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Município</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Dono</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Atividade</th>
              <th className="w-16 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={canBulk ? 6 : 5} className="text-center py-10 text-sm text-slate-500 italic">
                  Nenhuma oportunidade{tagFilter ? ` com a tag "${tagFilter}"` : ''}.{' '}
                  <Link href="/opportunities/new" className="text-i10-700 underline">Criar a primeira</Link>.
                </td>
              </tr>
            )}
            {filteredRows.map((r) => {
              const rot = isRotten({ stage: r.stage, lastActivityAt: r.lastActivityAt }, nowSnapshot);
              const checked = selected.has(r.id);
              return (
                <tr key={r.id} className={`${checked ? 'bg-i10-50/40' : 'hover:bg-slate-50'} ${rot ? 'border-l-2 border-rose-400' : ''}`}>
                  {canBulk && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4"
                        aria-label={`Selecionar #${r.id}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/opportunities/${r.id}`} className="font-medium hover:underline" style={{ color: 'var(--i10-navy)' }}>
                        {r.municipalityName ?? '(sem município)'}
                      </Link>
                      <StageBadge stage={r.stage as StageKey} />
                      <TagList r={r} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.ownerName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtMoney(r.estimatedValue)}</td>
                  <td className="px-4 py-3 text-xs"><StatusCell r={r} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <MetaPopover r={r} />
                      {isAdmin && <DeleteConfirm r={r} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky bulk action bar (navy) */}
      {canBulk && selected.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 text-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3"
          style={{ background: 'var(--i10-navy)' }}
        >
          <div className="text-sm font-medium">
            {selected.size} selecionada{selected.size === 1 ? '' : 's'}
          </div>
          <Select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="text-slate-900 text-xs py-1.5 w-auto"
          >
            <option value="">Reatribuir para…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="success"
            onClick={doBulkReassign}
            disabled={!newOwner || busy}
          >
            {busy ? 'Aplicando…' : 'Aplicar'}
          </Button>
          {isAdmin && (
            <Popover
              align="end"
              triggerClassName="text-xs px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-50"
              trigger={busy ? 'Excluindo…' : 'Excluir'}
              panelClassName="w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
            >
              {({ close }) => (
                <div className="text-xs text-slate-700">
                  <p>
                    Excluir <strong>{selected.size}</strong> oportunidade{selected.size === 1 ? '' : 's'}? Não pode ser desfeito.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={close}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        close();
                        doBulkDelete();
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              )}
            </Popover>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-300 hover:text-white text-xs"
          >
            Cancelar
          </button>
          {msg && <div className="text-xs">{msg}</div>}
        </div>
      )}
    </div>
  );
}
