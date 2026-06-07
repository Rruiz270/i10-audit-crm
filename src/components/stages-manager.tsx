'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { SwatchPicker, type SwatchOption } from '@/components/ui/swatch-picker';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
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

// Mantém 1:1 com o enum aceito por createCustomStage/updateStage (server).
// `key` = valor salvo (ex: 'cyan-500'); `color` = preview no círculo.
const STAGE_SWATCHES: SwatchOption[] = [
  { key: 'slate-500', color: '#64748b', label: 'Slate' },
  { key: 'blue-500', color: '#3b82f6', label: 'Azul' },
  { key: 'indigo-500', color: '#6366f1', label: 'Índigo' },
  { key: 'violet-500', color: '#8b5cf6', label: 'Violeta' },
  { key: 'amber-500', color: '#f59e0b', label: 'Âmbar' },
  { key: 'orange-500', color: '#f97316', label: 'Laranja' },
  { key: 'emerald-500', color: 'var(--i10-mint)', label: 'Mint' },
  { key: 'rose-500', color: '#f43f5e', label: 'Rosa' },
  { key: 'cyan-500', color: 'var(--i10-cyan)', label: 'Ciano' },
  { key: 'pink-500', color: '#ec4899', label: 'Pink' },
];

function swatchColor(key: string): string {
  return STAGE_SWATCHES.find((s) => s.key === key)?.color ?? '#64748b';
}

export function StagesManager({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  async function saveEdit(fd: FormData, close: () => void) {
    setErr(null);
    const res = await updateStage(fd);
    if (res.ok) {
      close();
      router.refresh();
    } else setErr(res.error);
  }

  async function toggle(key: string) {
    const fd = new FormData();
    fd.set('key', key);
    await toggleStageActive(fd);
    router.refresh();
  }

  async function onDelete(key: string, close: () => void) {
    if (!confirm(`Deletar estágio "${key}"? (Oportunidades neste estágio precisarão ser movidas manualmente.)`)) return;
    const fd = new FormData();
    fd.set('key', key);
    const res = await deleteCustomStage(fd);
    if (res.ok) {
      close();
      router.refresh();
    } else setErr(res.error);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    // probabilidade no form é 0–100 → o server espera 0–1.
    fd.set('probability', String((Number(fd.get('probability')) || 0) / 100));
    const res = await createCustomStage(fd);
    if (res.ok) {
      setAdding(false);
      router.refresh();
    } else setErr(res.error);
  }

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {err}
        </div>
      )}

      {/* Lista vertical ordenada de cards de estágio */}
      <ol className="space-y-2.5">
        {stages.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 ${
              s.isActive ? '' : 'opacity-50'
            }`}
          >
            <span className="w-6 shrink-0 text-center text-xs font-mono text-slate-400">
              {s.order}
            </span>
            <span
              className="h-8 w-8 shrink-0 rounded-lg border border-black/5"
              style={{ background: swatchColor(s.color) }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{s.label}</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                  {s.key}
                </code>
                {s.isCustom ? (
                  <Chip tone="cyan">custom</Chip>
                ) : (
                  <Chip tone="slate">padrão</Chip>
                )}
                {s.isTerminal && <Chip tone="amber">terminal</Chip>}
                {s.isWon && <Chip tone="mint">ganho</Chip>}
              </div>
              {s.description && (
                <div className="mt-0.5 truncate text-xs text-slate-500">{s.description}</div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-4 text-xs text-slate-600">
              <div className="text-center">
                <div className="font-semibold text-slate-900">
                  {Math.round(s.probability * 100)}%
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">prob.</div>
              </div>
              {s.rotDays != null && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  rot {s.rotDays}d
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Popover
                align="end"
                triggerClassName="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[var(--i10-navy)]"
                trigger={<Icon name="settings" size={16} />}
                panelClassName="w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              >
                {({ close }) => (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      fd.set('key', s.key);
                      fd.set(
                        'probability',
                        String((Number(fd.get('probability')) || 0) / 100),
                      );
                      saveEdit(fd, close);
                    }}
                    className="space-y-3"
                  >
                    <div className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
                      Editar “{s.label}”
                    </div>
                    <Field label="Label">
                      <Input name="label" defaultValue={s.label} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Ordem">
                        <Input name="order" type="number" defaultValue={s.order} />
                      </Field>
                      <Field label="Probabilidade (0–100)">
                        <Input
                          name="probability"
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={Math.round(s.probability * 100)}
                        />
                      </Field>
                    </div>
                    <Field label="Rot (dias)">
                      <Input name="rotDays" type="number" defaultValue={s.rotDays ?? ''} />
                    </Field>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Cor
                      </label>
                      <SwatchPicker name="color" value={s.color} options={STAGE_SWATCHES} />
                    </div>
                    <Field label="Descrição">
                      <Textarea name="description" rows={2} defaultValue={s.description ?? ''} />
                    </Field>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => toggle(s.key)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800"
                      >
                        {s.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                      <div className="flex gap-2">
                        {s.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDelete(s.key, close)}
                            className="text-xs font-medium text-rose-600 hover:text-rose-700"
                          >
                            Deletar
                          </button>
                        )}
                        <Button type="submit" size="sm">Salvar</Button>
                      </div>
                    </div>
                  </form>
                )}
              </Popover>
            </div>
          </li>
        ))}
      </ol>

      {!adding ? (
        <Button variant="accent" onClick={() => setAdding(true)}>
          + Adicionar estágio customizado
        </Button>
      ) : (
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
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
            <Field label="Probabilidade (0–100)">
              <Input name="probability" type="number" min="0" max="100" defaultValue="50" />
            </Field>
            <Field label="Rot. após X dias (opcional)">
              <Input name="rotDays" type="number" placeholder="ex: 14" />
            </Field>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Cor</label>
            <SwatchPicker name="color" value="cyan-500" options={STAGE_SWATCHES} />
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
