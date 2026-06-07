'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import {
  updateMemberRole,
  toggleMemberActive,
} from '@/lib/actions/team';
import {
  addUserProject,
  removeUserProject,
} from '@/lib/actions/marketing/user-projects';
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

type ProjectOption = { id: number; name: string };
type Membership = { userId: string; projectId: number };

const ROLE_TONE: Record<string, 'navy' | 'cyan' | 'slate'> = {
  admin: 'navy',
  gestor: 'cyan',
  consultor: 'slate',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  consultor: 'Consultor',
};

// admin/gestor enxergam todos os projetos — só consultor é escopado por projeto.
function seesAllProjects(role: string) {
  return role === 'admin' || role === 'gestor';
}

function Avatar({ member }: { member: { name: string | null; email: string; image: string | null } }) {
  if (member.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.image} alt="" className="h-10 w-10 rounded-full" />;
  }
  return (
    <div
      className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white"
      style={{ background: 'var(--i10-gradient-main)' }}
    >
      {member.name?.[0]?.toUpperCase() ?? member.email[0]?.toUpperCase()}
    </div>
  );
}

export function TeamManager({
  team,
  selfId,
  projects,
  memberships,
  marketingOn,
}: {
  team: Member[];
  selfId: string;
  projects: ProjectOption[];
  memberships: Membership[];
  marketingOn: boolean;
}) {
  const router = useRouter();
  const [adminCreateOpen, setAdminCreateOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const pending = team.filter((m) => m.approvalStatus === 'pending');
  const active = team.filter((m) => m.approvalStatus !== 'pending');

  const membershipSet = React.useMemo(() => {
    const s = new Set<string>();
    for (const m of memberships) s.add(`${m.userId}:${m.projectId}`);
    return s;
  }, [memberships]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const res = await adminCreateUser(fd);
    if (res.ok) {
      setOk(res.updated ? 'Usuário atualizado' : 'Usuário criado e aprovado');
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
      setOk('Usuário aprovado — já pode entrar');
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
      setOk('Senha redefinida');
      e.currentTarget.reset();
    } else setErr(res.error);
  }

  async function toggleProject(userId: string, projectId: number, has: boolean) {
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

  return (
    <div className="space-y-5">
      {(err || ok) && (
        <div
          className={`rounded-md p-3 text-xs ${
            err
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {err || ok}
        </div>
      )}

      {/* Pendentes de aprovação — banda de cards no topo */}
      {pending.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <Icon name="clock" size={16} />
            </span>
            <h2 className="text-sm font-bold text-amber-900">
              {pending.length} cadastro{pending.length === 1 ? '' : 's'} aguardando aprovação
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pending.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
              >
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-amber-950">
                    {m.name ?? '—'}
                  </div>
                  <div className="truncate text-xs text-amber-900">{m.email}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => approve(m.id)} disabled={busy === m.id}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => reject(m.id)} disabled={busy === m.id}>
                    Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {team.length} membro{team.length === 1 ? '' : 's'} ·{' '}
          {active.filter((m) => m.isActive).length} ativos · {pending.length} pending
        </div>
        <Button variant="accent" onClick={() => setAdminCreateOpen((v) => !v)}>
          {adminCreateOpen ? 'Cancelar' : '+ Criar usuário direto'}
        </Button>
      </div>

      {adminCreateOpen && (
        <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
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
          <div className="flex justify-end">
            <Button type="submit" size="sm">Criar e aprovar</Button>
          </div>
        </form>
      )}

      {/* Lista person-centric */}
      <div className="space-y-2.5">
        {active.map((m) => {
          const isSelf = m.id === selfId;
          const seesAll = seesAllProjects(m.role);
          const memberProjects = projects.filter((p) =>
            membershipSet.has(`${m.id}:${p.id}`),
          );
          return (
            <div
              key={m.id}
              className={`flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 ${
                m.isActive ? '' : 'opacity-50'
              }`}
            >
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{m.name ?? '—'}</span>
                  {isSelf && <span className="text-[10px] text-slate-400">(você)</span>}
                  <Chip tone={ROLE_TONE[m.role] ?? 'slate'}>{ROLE_LABEL[m.role] ?? m.role}</Chip>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {m.isActive ? 'ativo' : 'inativo'}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{m.email}</div>
                {/* Chips de acesso por projeto */}
                {marketingOn && projects.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {seesAll ? (
                      <Chip tone="mint">vê todos os projetos</Chip>
                    ) : memberProjects.length > 0 ? (
                      memberProjects.map((p) => (
                        <Chip key={p.id} tone="cyan">{p.name}</Chip>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400">só conversas atribuídas</span>
                    )}
                  </div>
                )}
              </div>

              {/* Ação primária: Gerenciar acessos (popup) */}
              <Popover
                align="end"
                triggerClassName="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-[var(--i10-navy)] hover:bg-slate-200"
                trigger={
                  <>
                    <Icon name="settings" size={14} />
                    Gerenciar acessos
                  </>
                }
                panelClassName="w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              >
                {() => (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
                        {m.name ?? m.email}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Define papel e o que vê em Oportunidades e Conversas
                      </div>
                    </div>

                    {/* Papel — SegmentedControl → updateMemberRole */}
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Papel
                      </div>
                      <SegmentedControl
                        className="w-full"
                        value={m.role}
                        onChange={(v) => {
                          if (v !== m.role) changeRole(m.id, v);
                        }}
                        options={[
                          { value: 'consultor', label: 'Consultor' },
                          { value: 'gestor', label: 'Gestor' },
                          { value: 'admin', label: 'Admin' },
                        ]}
                      />
                      {isSelf && m.role === 'admin' && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          Você não pode rebaixar o próprio admin.
                        </div>
                      )}
                    </div>

                    {/* Acesso por projeto — Switch → add/removeUserProject */}
                    {marketingOn && projects.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Acesso por projeto
                        </div>
                        {seesAll && (
                          <div className="mb-2 rounded-md bg-i10-mint-wash px-2.5 py-1.5 text-[11px] text-i10-mint-dark">
                            {ROLE_LABEL[m.role]} vê todos os projetos.
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {projects.map((p) => {
                            const has = membershipSet.has(`${m.id}:${p.id}`);
                            const key = `${m.id}:${p.id}`;
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-2.5 py-2"
                              >
                                <span className="truncate text-sm text-slate-700">{p.name}</span>
                                <Switch
                                  checked={seesAll ? true : has}
                                  disabled={seesAll || busy === key}
                                  onChange={() => toggleProject(m.id, p.id, has)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Footer: senha · desativar */}
                    <div className="space-y-3 border-t border-slate-100 pt-3">
                      <form onSubmit={(e) => onResetPassword(e, m.id)} className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Redefinir senha (mín 8)
                        </label>
                        <div className="flex gap-2">
                          <Input name="password" type="password" required minLength={8} placeholder="••••••••" />
                          <Button size="sm" type="submit">Salvar</Button>
                        </div>
                      </form>
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => toggle(m.id)}
                          disabled={busy === m.id}
                          className="text-xs font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50"
                        >
                          {m.isActive ? 'Desativar usuário' : 'Reativar usuário'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Popover>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-slate-400">
        {ROLE_LABEL.admin}: acesso total. {ROLE_LABEL.gestor}: admin sem deleção destrutiva.{' '}
        {ROLE_LABEL.consultor}: operação normal, escopado por projeto.
      </div>
    </div>
  );
}
