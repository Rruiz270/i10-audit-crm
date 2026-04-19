'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  createCustomStage,
  updateStage,
  toggleStageActive,
  deleteCustomStage,
} from '@/lib/actions/stages';

type Stage = {
  key: string;
  label: string;
  description: string | null;
  color: string;
  order: number;
  probability: number;
  rotDays: number | null;
  isTerminal: boolean;
  isWon: boolean;
  isCustom: boolean;
  isActive: boolean;
};

const COLOR_OPTS = [
  'slate-500',
  'blue-500',
  'indigo-500',
  'violet-500',
  'amber-500',
  'orange-500',
  'emerald-500',
  'rose-500',
  'cyan-500',
  'pink-500',
];

export function StagesManager({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  async function saveEdit(fd: FormData) {
    setErr(null);
    const res = await updateStage(fd);
    if (res.ok) {
      setEditingKey(null);
      router.refresh();
    } else setErr(res.error);
  }

  async function toggle(key: string) {
    const fd = new FormData();
    fd.set('key', key);
    await toggleStageActive(fd);
    router.refresh();
  }

  async function onDelete(key: string) {
    if (!confirm(`Deletar estágio "${key}"? (Oportunidades neste estágio precisarão ser movidas manualmente.)`)) return;
    const fd = new FormData();
    fd.set('key', key);
    const res = await deleteCustomStage(fd);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await createCustomStage(fd);
    if (res.ok) {
      setAdding(false);
      router.refresh();
    } else setErr(res.error);
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {err}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Ordem</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Chave</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Label</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Probab.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Rot.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stages.map((s) =>
              editingKey === s.key ? (
                <tr key={s.key} className="bg-amber-50/50">
                  <td colSpan={7} className="p-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        fd.set('key', s.key);
                        saveEdit(fd);
                      }}
                      className="grid grid-cols-6 gap-3 items-end"
                    >
                      <Field label="Ordem">
                        <Input name="order" type="number" defaultValue={s.order} />
                      </Field>
                      <Field label="Label">
                        <Input name="label" defaultValue={s.label} />
                      </Field>
                      <Field label="Cor">
                        <Select name="color" defaultValue={s.color}>
                          {COLOR_OPTS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Probabilidade (0-1)">
                        <Input name="probability" type="number" step="0.05" min="0" max="1" defaultValue={s.probability} />
                      </Field>
                      <Field label="Rot (dias)">
                        <Input name="rotDays" type="number" defaultValue={s.rotDays ?? ''} />
                      </Field>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">Salvar</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setEditingKey(null)}>
                          Cancelar
                        </Button>
                      </div>
                      <div className="col-span-6">
                        <Field label="Descrição">
                          <Textarea name="description" rows={2} defaultValue={s.description ?? ''} />
                        </Field>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={s.key} className={s.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{s.order}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.key}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{
                          background: s.color.startsWith('cyan')
                            ? 'var(--i10-cyan)'
                            : s.color.startsWith('emerald') || s.color.startsWith('mint')
                              ? 'var(--i10-mint)'
                              : s.color,
                        }}
                      />
                      <span className="font-medium text-slate-900">{s.label}</span>
                    </div>
                    {s.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {Math.round(s.probability * 100)}%
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {s.rotDays != null ? `${s.rotDays}d` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.isCustom ? (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700">custom</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">padrão</span>
                    )}
                    {s.isTerminal && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">terminal</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingKey(s.key)}
                        className="text-i10-700 hover:underline"
                      >
                        editar
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        onClick={() => toggle(s.key)}
                        className="text-slate-500 hover:text-slate-800"
                      >
                        {s.isActive ? 'desativar' : 'ativar'}
                      </button>
                      {s.isCustom && (
                        <>
                          <span className="text-slate-300">·</span>
                          <button
                            onClick={() => onDelete(s.key)}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            deletar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {!adding ? (
        <Button variant="accent" onClick={() => setAdding(true)}>
          + Adicionar estágio customizado
        </Button>
      ) : (
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div>
            <div className="i10-eyebrow mb-2">Novo estágio customizado</div>
            <p className="text-xs text-slate-500">
              Estágios customizados aparecem no Kanban junto com os padrão. Podem ser
              usados para sub-fluxos (ex: &ldquo;Aprovação jurídica&rdquo;, &ldquo;Kickoff
              pendente&rdquo;). Não têm regras de qualificação — é responsabilidade do
              consultor mover pro próximo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chave (a-z, 0-9, underscore)">
              <Input name="key" required pattern="[a-z0-9_]+" placeholder="ex: kickoff_pendente" />
            </Field>
            <Field label="Label">
              <Input name="label" required placeholder="ex: Kickoff pendente" />
            </Field>
            <Field label="Ordem (posição na lista)">
              <Input name="order" type="number" required defaultValue={8} />
            </Field>
            <Field label="Cor">
              <Select name="color" defaultValue="cyan-500">
                {COLOR_OPTS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Probabilidade (0-1)">
              <Input name="probability" type="number" step="0.05" min="0" max="1" defaultValue="0.5" />
            </Field>
            <Field label="Rot. após X dias (opcional)">
              <Input name="rotDays" type="number" placeholder="ex: 14" />
            </Field>
          </div>
          <Field label="Descrição">
            <Textarea name="description" rows={2} placeholder="Opcional — o que acontece neste estágio?" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar estágio
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
