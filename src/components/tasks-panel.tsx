'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createTask, completeTask, deleteTask } from '@/lib/actions/tasks';

type Task = {
  id: number;
  title: string;
  description: string | null;
  dueAt: Date;
  completedAt: Date | null;
  priority: string;
  assignedTo: string | null;
  assigneeName: string | null;
};

type User = { id: string; name: string | null; email: string };

function fmt(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

function relative(d: Date | string) {
  const ms = new Date(d).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (days > 1) return `em ${days}d`;
  if (days === 1) return 'amanhã';
  if (days === 0) return 'hoje';
  if (days === -1) return 'ontem';
  return `atrasada há ${-days}d`;
}

export function TasksPanel({
  opportunityId,
  tasks,
  users: teamUsers,
}: {
  opportunityId: number;
  tasks: Task[];
  users: User[];
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const nowIso = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set('opportunityId', String(opportunityId));
    const res = await createTask(fd);
    setPending(false);
    if (res?.ok) {
      formRef.current?.reset();
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  async function toggle(taskId: number) {
    const fd = new FormData();
    fd.set('id', String(taskId));
    await completeTask(fd);
    router.refresh();
  }

  async function remove(taskId: number) {
    if (!confirm('Remover tarefa?')) return;
    const fd = new FormData();
    fd.set('id', String(taskId));
    fd.set('opportunityId', String(opportunityId));
    await deleteTask(fd);
    router.refresh();
  }

  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  // useState with lazy initializer is the documented escape hatch for
  // reading the clock during render (react-hooks/purity is permissive here).
  const [nowMs] = React.useState(() => Date.now());

  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {open.map((t) => {
            const overdue = new Date(t.dueAt).getTime() < nowMs;
            return (
              <li key={t.id} className="py-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggle(t.id)}
                  className="mt-1 h-4 w-4"
                  aria-label="Concluir"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">
                    {t.title}
                    {t.priority === 'high' && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">alta</span>
                    )}
                    {t.priority === 'low' && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500">baixa</span>
                    )}
                  </div>
                  <div className={`text-xs mt-0.5 ${overdue ? 'text-rose-700 font-medium' : 'text-slate-500'}`}>
                    {fmt(t.dueAt)} · {relative(t.dueAt)}
                    {t.assigneeName && ` · para ${t.assigneeName}`}
                  </div>
                  {t.description && (
                    <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{t.description}</div>
                  )}
                </div>
                <button onClick={() => remove(t.id)} className="text-xs text-slate-400 hover:text-rose-600">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            Concluídas ({done.length})
          </summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {done.map((t) => (
              <li key={t.id} className="py-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggle(t.id)}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1 text-slate-400 line-through">
                  {t.title}
                  <div className="text-[11px] text-slate-400 no-underline">
                    Concluída em {fmt(t.completedAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {tasks.length === 0 && (
        <div className="text-xs text-slate-400 italic">Sem tarefas. Crie a próxima ação abaixo.</div>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="bg-slate-50 rounded-md p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Título da tarefa">
            <Input name="title" required placeholder="Ex: Ligar para Prefeito" />
          </Field>
          <Field label="Vence em">
            <Input type="datetime-local" name="dueAt" defaultValue={nowIso} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prioridade">
            <Select name="priority" defaultValue="normal">
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
            </Select>
          </Field>
          <Field label="Responsável">
            <Select name="assignedTo">
              <option value="">Eu (atual)</option>
              {teamUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descrição (opcional)">
          <Textarea name="description" rows={2} />
        </Field>
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <div className="flex justify-end">
          <Button size="sm" disabled={pending}>
            {pending ? 'Salvando…' : 'Nova tarefa'}
          </Button>
        </div>
      </form>
    </div>
  );
}
