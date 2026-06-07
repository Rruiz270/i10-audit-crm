'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createTag, toggleTagActive, deleteTag, type TagRow } from '@/lib/actions/tags';
import { tagChipStyle, TAG_COLOR_OPTS } from '@/lib/tag-colors';

const CATEGORY_LABEL: Record<string, string> = {
  origem: 'Origem',
  produto: 'Produto',
  outro: 'Outro',
};

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  async function toggle(id: number) {
    const fd = new FormData();
    fd.set('id', String(id));
    await toggleTagActive(fd);
    router.refresh();
  }

  async function onDelete(id: number, label: string) {
    if (!confirm(`Deletar a tag "${label}"? Oportunidades já marcadas mantêm o texto.`)) return;
    const fd = new FormData();
    fd.set('id', String(id));
    const res = await deleteTag(fd);
    if (res.ok) router.refresh();
    else setErr(res.error);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await createTag(fd);
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
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Tag</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Categoria</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tags.map((t) => (
              <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center text-xs px-2 py-0.5 rounded font-medium"
                    style={tagChipStyle(t.color)}
                  >
                    {t.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {CATEGORY_LABEL[t.category] ?? t.category}
                </td>
                <td className="px-4 py-3 text-xs">
                  {t.isCustom ? (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700">custom</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">padrão</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {t.isActive ? 'Ativa' : 'Inativa'}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggle(t.id)}
                      className="text-slate-500 hover:text-slate-800"
                      type="button"
                    >
                      {t.isActive ? 'desativar' : 'ativar'}
                    </button>
                    {t.isCustom && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          onClick={() => onDelete(t.id, t.label)}
                          className="text-rose-600 hover:text-rose-700"
                          type="button"
                        >
                          deletar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!adding ? (
        <Button variant="accent" onClick={() => setAdding(true)}>
          + Adicionar tag
        </Button>
      ) : (
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="i10-eyebrow mb-2">Nova tag</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Label">
              <Input name="label" required placeholder="ex: Município Bilíngue" />
            </Field>
            <Field label="Categoria">
              <Select name="category" defaultValue="outro">
                <option value="origem">Origem</option>
                <option value="produto">Produto</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
            <Field label="Cor">
              <Select name="color" defaultValue="slate">
                {TAG_COLOR_OPTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar tag
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
