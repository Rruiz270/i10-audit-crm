'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StageBadge } from '@/components/ui/stage-badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { bulkReassign } from '@/lib/actions/opportunities';
import { isRotten } from '@/lib/forecast';
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

export function OpportunitiesTable({
  rows,
  users,
  canBulk,
  tagFilter,
}: {
  rows: Row[];
  users: User[];
  canBulk: boolean;
  tagFilter?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [newOwner, setNewOwner] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const filteredRows = tagFilter
    ? rows.filter((r) => (r.tags ?? []).includes(tagFilter))
    : rows;

  const allTags = React.useMemo(() => {
    const bag = new Set<string>();
    for (const r of rows) for (const t of r.tags ?? []) bag.add(t);
    return [...bag].sort();
  }, [rows]);
  // One clock read per render — rotten comparison runs on same snapshot.
  const [nowSnapshot] = React.useState(() => new Date());

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
      setMsg(`✓ ${res.count} reatribuída${res.count === 1 ? '' : 's'}`);
      setSelected(new Set());
      router.refresh();
    } else {
      setMsg(res.error ?? 'Erro');
    }
  }

  return (
    <div>
      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Filtrar por tag:</span>
          <Link
            href="/opportunities"
            className={`px-2 py-1 rounded ${!tagFilter ? 'bg-i10-50 text-i10-700 font-medium' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            todas
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/opportunities?tag=${encodeURIComponent(t)}`}
              className={`px-2 py-1 rounded ${tagFilter === t ? 'bg-i10-50 text-i10-700 font-medium' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {canBulk && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selected.size === filteredRows.length}
                    onChange={toggleAll}
                    className="h-4 w-4"
                    aria-label="Selecionar tudo"
                  />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Município</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Estágio</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Tags</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Fechamento</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Dono</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Criada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-10 text-sm text-slate-500 italic">
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
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    #{r.id} {rot && <span title="Sem atividade recente">🕑</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/opportunities/${r.id}`} className="text-i10-700 hover:underline font-medium">
                      {r.municipalityName ?? '(sem município)'}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={r.stage as StageKey} /></td>
                  <td className="px-4 py-3">
                    {(r.tags?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {r.tags!.slice(0, 3).map((t) => (
                          <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {t}
                          </span>
                        ))}
                        {r.tags!.length > 3 && (
                          <span className="text-[11px] text-slate-400">+{r.tags!.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{fmtMoney(r.estimatedValue)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtDate(r.closeDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.ownerName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky bulk action bar */}
      {canBulk && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-lg shadow-lg px-5 py-3 flex items-center gap-3">
          <div className="text-sm font-medium">
            {selected.size} selecionada{selected.size === 1 ? '' : 's'}
          </div>
          <Select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="text-slate-900 text-xs py-1.5"
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
