'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, Field } from '@/components/ui/input';
import { claimOpportunity, reassignOpportunity } from '@/lib/actions/opportunities';
import { isAdmin } from '@/lib/roles';

type TeamUser = { id: string; name: string | null; email: string; role: string };

export function OwnerControl({
  opportunityId,
  currentOwnerId,
  currentOwnerName,
  stage,
  users,
  viewerId,
  viewerRole,
}: {
  opportunityId: number;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  stage: string;
  users: TeamUser[];
  viewerId: string;
  viewerRole: string;
}) {
  const router = useRouter();
  const admin = isAdmin(viewerRole);
  const [selected, setSelected] = React.useState(currentOwnerId ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isOwner = currentOwnerId && currentOwnerId === viewerId;
  const inPool = !currentOwnerId && stage === 'novo';

  async function claim() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('id', String(opportunityId));
    const res = await claimOpportunity(fd);
    setPending(false);
    if (res?.ok) router.refresh();
    else setError(res?.error ?? 'Falha ao assumir o lead.');
  }

  async function assign() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('id', String(opportunityId));
    fd.set('ownerId', selected);
    const res = await reassignOpportunity(fd);
    setPending(false);
    if (res?.ok) router.refresh();
    else setError('Falha ao definir o dono.');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Dono atual</span>
        <span className="font-medium text-slate-800">
          {currentOwnerName ?? (inPool ? 'Pool (sem dono)' : '—')}
        </span>
      </div>

      {/* Consultor pega o lead do pool */}
      {!admin && inPool && (
        <Button size="sm" onClick={claim} disabled={pending} className="w-full">
          {pending ? 'Assumindo…' : '✋ Pegar este lead'}
        </Button>
      )}

      {!admin && isOwner && (
        <p className="text-xs text-emerald-700">Você é o dono deste lead.</p>
      )}

      {/* Admin / gestor define ou troca o dono */}
      {admin && (
        <Field label="Definir dono">
          <div className="flex gap-2">
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">— sem dono (pool) —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email} {u.role !== 'consultor' ? `· ${u.role}` : ''}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              onClick={assign}
              disabled={pending || selected === (currentOwnerId ?? '')}
            >
              {pending ? '…' : 'Salvar'}
            </Button>
          </div>
        </Field>
      )}

      {inPool && (
        <p className="text-[11px] text-slate-400">
          Ao definir um dono, o lead sai do pool e vai para <b>Contato Inicial</b>.
        </p>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
