'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { addUserProject, removeUserProject } from '@/lib/actions/marketing/user-projects';

type ProjectOption = { id: number; name: string };
type Membership = { userId: string; projectId: number };
type Member = { id: string; name: string | null; email: string; role: string };

/**
 * F3 — Filas por projeto (Conversas WhatsApp).
 * Admin/gestor atribui quais projetos cada CONSULTOR (agente) pode ver no inbox.
 * admin/gestor não aparecem na matriz: já veem tudo (supervisores).
 */
export function ConversationQueuesManager({
  team,
  projects,
  memberships,
}: {
  team: Member[];
  projects: ProjectOption[];
  memberships: Membership[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // só consultores precisam de fila — admin/gestor veem tudo.
  const agents = team.filter((m) => m.role === 'consultor');

  const set = React.useMemo(() => {
    const s = new Set<string>();
    for (const m of memberships) s.add(`${m.userId}:${m.projectId}`);
    return s;
  }, [memberships]);

  async function toggle(userId: string, projectId: number, has: boolean) {
    const key = `${userId}:${projectId}`;
    setBusy(key);
    setErr(null);
    const fd = new FormData();
    fd.set('userId', userId);
    fd.set('projectId', String(projectId));
    const res = has ? await removeUserProject(fd) : await addUserProject(fd);
    setBusy(null);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum projeto de marketing cadastrado ainda. Crie um projeto para poder
        atribuir filas de conversas.
      </p>
    );
  }

  if (agents.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum consultor ativo. Admins e gestores já veem todas as conversas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          {err}
        </div>
      )}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">
                Consultor
              </th>
              {projects.map((p) => (
                <th
                  key={p.id}
                  className="px-3 py-3 text-center text-xs font-medium text-slate-600"
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agents.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{m.name ?? '—'}</div>
                  <div className="text-xs text-slate-500">{m.email}</div>
                </td>
                {projects.map((p) => {
                  const key = `${m.id}:${p.id}`;
                  const has = set.has(key);
                  return (
                    <td key={p.id} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={busy === key}
                        onChange={() => toggle(m.id, p.id, has)}
                        className="h-4 w-4 cursor-pointer accent-[var(--i10-navy)] disabled:opacity-40"
                        aria-label={`${m.name ?? m.email} pode ver ${p.name}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        Consultor marcado vê as conversas daquele projeto no inbox WhatsApp, além
        das conversas atribuídas diretamente a ele. Admin e gestor veem todas.
      </p>
    </div>
  );
}
