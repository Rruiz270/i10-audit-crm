'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  updateMemberRole,
  toggleMemberActive,
} from '@/lib/actions/team';
import {
  adminCreateUser,
  approveMember,
  rejectMember,
  resetMemberPassword,
} from '@/lib/actions/signup';

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean | null;
  approvalStatus: string;
  hasPassword: string | null;
  image: string | null;
  createdAt: Date | null;
};

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-[var(--i10-navy)] text-white',
  gestor: 'bg-[var(--i10-cyan)] text-[var(--i10-navy-dark)]',
  consultor: 'bg-slate-100 text-slate-700',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  consultor: 'Consultor',
};

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'pending') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">
        aguardando aprovação
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-800">
        rejeitado
      </span>
    );
  }
  return null;
}

export function TeamManager({ team, selfId }: { team: Member[]; selfId: string }) {
  const router = useRouter();
  const [adminCreateOpen, setAdminCreateOpen] = React.useState(false);
  const [passwordResetFor, setPasswordResetFor] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const pending = team.filter((m) => m.approvalStatus === 'pending');
  const active = team.filter((m) => m.approvalStatus !== 'pending');

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const res = await adminCreateUser(fd);
    if (res.ok) {
      setOk(res.updated ? '✓ Usuário atualizado' : '✓ Usuário criado e aprovado');
      setAdminCreateOpen(false);
      router.refresh();
    } else setErr(res.error);
  }

  async function approve(id: string) {
    setBusy(id);
    setErr(null);
    const fd = new FormData();
    fd.set('id', id);
    const res = await approveMember(fd);
    setBusy(null);
    if (res.ok) {
      setOk('✓ Usuário aprovado — já pode entrar');
      router.refresh();
    } else setErr(res.error);
  }

  async function reject(id: string) {
    if (!confirm('Rejeitar este cadastro? O usuário não conseguirá entrar.')) return;
    setBusy(id);
    setErr(null);
    const fd = new FormData();
    fd.set('id', id);
    const res = await rejectMember(fd);
    setBusy(null);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  async function changeRole(id: string, role: string) {
    setBusy(id);
    setErr(null);
    const fd = new FormData();
    fd.set('id', id);
    fd.set('role', role);
    const res = await updateMemberRole(fd);
    setBusy(null);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  async function toggle(id: string) {
    setBusy(id);
    setErr(null);
    const fd = new FormData();
    fd.set('id', id);
    const res = await toggleMemberActive(fd);
    setBusy(null);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  async function onResetPassword(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set('id', id);
    const res = await resetMemberPassword(fd);
    if (res.ok) {
      setOk('✓ Senha redefinida');
      setPasswordResetFor(null);
    } else setErr(res.error);
  }

  return (
    <div className="space-y-5">
      {(err || ok) && (
        <div
          className={`rounded-md p-3 text-xs ${
            err ? 'bg-rose-50 border border-rose-200 text-rose-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {err || ok}
        </div>
      )}

      {/* Pending approvals — destaque */}
      {pending.length > 0 && (
        <section
          className="rounded-lg p-5"
          style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-amber-900" style={{ letterSpacing: '3px' }}>
                Aguardando aprovação
              </div>
              <h2 className="text-base font-bold text-amber-950 mt-1">
                {pending.length} cadastro{pending.length === 1 ? '' : 's'} pendente{pending.length === 1 ? '' : 's'}
              </h2>
            </div>
          </div>
          <ul className="divide-y divide-amber-200">
            {pending.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-amber-950">{m.name ?? '—'}</div>
                  <div className="text-xs text-amber-900">{m.email}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => approve(m.id)}
                    disabled={busy === m.id}
                  >
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => reject(m.id)}
                    disabled={busy === m.id}
                  >
                    Rejeitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {team.length} membro{team.length === 1 ? '' : 's'} · {active.filter((m) => m.isActive).length} ativos · {pending.length} pending
        </div>
        <Button variant="accent" onClick={() => setAdminCreateOpen((v) => !v)}>
          {adminCreateOpen ? 'Cancelar' : '+ Criar usuário direto'}
        </Button>
      </div>

      {adminCreateOpen && (
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-3"
        >
          <div className="i10-eyebrow">Criar usuário (bypass de aprovação)</div>
          <p className="text-xs text-slate-500">
            Admin cria direto — o usuário entra já aprovado. Use pra gestores/admins
            novos. Para consultores, é melhor deixá-los usar <code>/signup</code> e
            você só aprova.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input name="email" type="email" required placeholder="fulano@i10.org" />
            </Field>
            <Field label="Nome">
              <Input name="name" required placeholder="Nome completo" />
            </Field>
            <Field label="Senha inicial (mín 8)">
              <Input name="password" type="password" required minLength={8} placeholder="••••••••" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="consultor">
                <option value="consultor">Consultor</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" size="sm">Criar e aprovar</Button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Membro</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Login</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-600 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((m) => {
              const isSelf = m.id === selfId;
              return (
                <React.Fragment key={m.id}>
                  <tr className={m.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.image} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ background: 'var(--i10-gradient-main)' }}
                          >
                            {m.name?.[0]?.toUpperCase() ?? m.email[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            {m.name ?? '—'}
                            {isSelf && <span className="text-[10px] text-slate-400">(você)</span>}
                            <ApprovalBadge status={m.approvalStatus} />
                          </div>
                          <div className="text-xs text-slate-500">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        disabled={busy === m.id || (isSelf && m.role === 'admin')}
                        className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${ROLE_STYLE[m.role] ?? ROLE_STYLE.consultor}`}
                      >
                        <option value="consultor">Consultor</option>
                        <option value="gestor">Gestor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded ${m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {m.isActive ? 'ativo' : 'inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.hasPassword ? (
                        <span className="text-emerald-700">✓ email+senha</span>
                      ) : (
                        <span className="text-slate-400">só Google</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setPasswordResetFor(passwordResetFor === m.id ? null : m.id)}
                          className="text-slate-500 hover:text-[var(--i10-navy)]"
                        >
                          {passwordResetFor === m.id ? 'Cancelar' : 'Senha'}
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => toggle(m.id)}
                            disabled={busy === m.id}
                            className="text-slate-500 hover:text-[var(--i10-navy)] disabled:opacity-50"
                          >
                            {m.isActive ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {passwordResetFor === m.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <form
                          onSubmit={(e) => onResetPassword(e, m.id)}
                          className="flex items-end gap-3"
                        >
                          <Field label={`Nova senha para ${m.email} (mín 8)`}>
                            <Input name="password" type="password" required minLength={8} />
                          </Field>
                          <Button size="sm" type="submit">Salvar senha</Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-slate-400">
        {ROLE_LABEL.admin}: acesso total. {ROLE_LABEL.gestor}: admin sem deleção destrutiva. {ROLE_LABEL.consultor}: operação normal.
      </div>
    </div>
  );
}
