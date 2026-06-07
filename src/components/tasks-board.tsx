'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import type { Tone } from '@/components/ui/kpi-tile';
import { completeTask, createTask } from '@/lib/actions/tasks';

// Linha de tarefa servida pelo server component (mesma forma de listAllTasks).
export type BoardTask = {
  id: number;
  title: string;
  dueAt: Date | string;
  completedAt: Date | string | null;
  priority: string;
  opportunityId: number;
  assigneeName: string | null;
  municipalityName: string | null;
};

type OpportunityOption = { id: number; municipalityName: string | null };
type UserOption = { id: string; name: string | null; email: string };

const PRIO: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Baixa', tone: 'slate' },
  normal: { label: 'Normal', tone: 'navy' },
  high: { label: 'Alta', tone: 'rose' },
};

function relative(d: Date | string, nowMs: number): string {
  const ms = new Date(d).getTime() - nowMs;
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (days > 1) return `vence em ${days}d`;
  if (days === 1) return 'vence amanhã';
  if (days === 0) return 'vence hoje';
  if (days === -1) return 'venceu ontem';
  return `venceu há ${-days}d`;
}

function TaskRow({
  t,
  nowMs,
  overdue,
  onToggle,
}: {
  t: BoardTask;
  nowMs: number;
  overdue: boolean;
  onToggle: (id: number, done: boolean) => void;
}) {
  const done = !!t.completedAt;
  const prio = PRIO[t.priority] ?? PRIO.normal;
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
        onClick={() => onToggle(t.id, done)}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
          done
            ? 'border-i10-mint-dark bg-i10-mint text-white'
            : 'border-slate-300 text-transparent hover:border-i10-cyan'
        }`}
      >
        <Icon name="check" size={13} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${done ? 'text-slate-400 line-through' : 'font-medium text-slate-900'}`}>
          {t.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <Link href={`/opportunities/${t.opportunityId}`} className="text-i10-700 hover:underline">
            {t.municipalityName ?? `#${t.opportunityId}`}
          </Link>
          <span>·</span>
          <span className={overdue && !done ? 'font-medium text-rose-700' : ''}>
            {relative(t.dueAt, nowMs)}
          </span>
          {t.assigneeName && (
            <>
              <span>·</span>
              <span>{t.assigneeName}</span>
            </>
          )}
        </div>
      </div>
      {!done && <Chip tone={prio.tone}>{prio.label}</Chip>}
    </div>
  );
}

function Group({
  title,
  tone,
  tasks,
  nowMs,
  overdue,
  collapsed,
  onToggle,
}: {
  title: string;
  tone?: 'rose';
  tasks: BoardTask[];
  nowMs: number;
  overdue?: boolean;
  collapsed?: boolean;
  onToggle: (id: number, done: boolean) => void;
}) {
  if (tasks.length === 0) return null;
  const heading = (
    <h3 className={`text-sm font-semibold ${tone === 'rose' ? 'text-rose-700' : ''}`} style={tone === 'rose' ? undefined : { color: 'var(--i10-navy)' }}>
      {title} <span className="font-normal text-slate-400">({tasks.length})</span>
    </h3>
  );
  const body = (
    <div className="mt-1">
      {tasks.map((t) => (
        <TaskRow key={t.id} t={t} nowMs={nowMs} overdue={!!overdue} onToggle={onToggle} />
      ))}
    </div>
  );
  return (
    <section
      className={`rounded-xl border bg-white p-4 ${
        tone === 'rose' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'
      }`}
    >
      {collapsed ? (
        <details>
          <summary className="cursor-pointer list-none">{heading}</summary>
          {body}
        </details>
      ) : (
        <>
          {heading}
          {body}
        </>
      )}
    </section>
  );
}

export function TasksBoard({
  tasks,
  opportunities,
  users,
}: {
  tasks: BoardTask[];
  opportunities: OpportunityOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [nowMs] = React.useState(() => Date.now());
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const defaultDue = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  async function onToggle(id: number, done: boolean) {
    // optimismo mínimo: dispara a action e revalida via router.refresh()
    void done;
    const fd = new FormData();
    fd.set('id', String(id));
    await completeTask(fd);
    router.refresh();
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>, close: () => void) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const res = await createTask(new FormData(e.currentTarget));
    setPending(false);
    if (res?.ok) {
      formRef.current?.reset();
      close();
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  // Agrupamento por janela temporal (apenas tarefas em aberto).
  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = startOfToday.getTime() + 24 * 3600 * 1000;
  const endOfWeek = startOfToday.getTime() + 7 * 24 * 3600 * 1000;

  const overdue: BoardTask[] = [];
  const today: BoardTask[] = [];
  const week: BoardTask[] = [];
  const later: BoardTask[] = [];
  for (const t of open) {
    const due = new Date(t.dueAt).getTime();
    if (due < startOfToday.getTime()) overdue.push(t);
    else if (due < endOfToday) today.push(t);
    else if (due < endOfWeek) week.push(t);
    else later.push(t);
  }
  const byDue = (a: BoardTask, b: BoardTask) =>
    new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  overdue.sort(byDue);
  today.sort(byDue);
  week.sort(byDue);
  later.sort(byDue);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Popover
          align="end"
          trigger={
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-i10-cyan to-i10-mint px-4 py-2 text-sm font-semibold text-i10-navy-dark shadow-sm">
              <Icon name="plus" size={16} /> Nova tarefa
            </span>
          }
          panelClassName="w-[26rem] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          {({ close }) => (
            <form ref={formRef} onSubmit={(e) => onCreate(e, close)} className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
                Nova tarefa
              </h3>
              <Field label="Oportunidade">
                <Select name="opportunityId" required defaultValue="">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {opportunities.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.municipalityName ?? `#${o.id}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Título da tarefa">
                <Input name="title" required placeholder="Ex: Ligar para o Prefeito" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vence em">
                  <Input type="datetime-local" name="dueAt" defaultValue={defaultDue} required />
                </Field>
                <Field label="Prioridade">
                  <Select name="priority" defaultValue="normal">
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                  </Select>
                </Field>
              </div>
              <Field label="Responsável">
                <Select name="assignedTo">
                  <option value="">Eu (atual)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Descrição (opcional)">
                <Textarea name="description" rows={2} />
              </Field>
              {err && <div className="text-xs text-rose-600">{err}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={close}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={pending}>
                  {pending ? 'Salvando…' : 'Criar tarefa'}
                </Button>
              </div>
            </form>
          )}
        </Popover>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm italic text-slate-500">
          Sem tarefas no momento.
        </div>
      ) : (
        <div className="space-y-3">
          <Group title="Atrasadas" tone="rose" tasks={overdue} nowMs={nowMs} overdue onToggle={onToggle} />
          <Group title="Hoje" tasks={today} nowMs={nowMs} onToggle={onToggle} />
          <Group title="Esta semana" tasks={week} nowMs={nowMs} onToggle={onToggle} />
          <Group title="Depois" tasks={later} nowMs={nowMs} onToggle={onToggle} />
          <Group title="Concluídas" tasks={done} nowMs={nowMs} collapsed onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}
