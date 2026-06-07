'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SwatchPicker, type SwatchOption } from '@/components/ui/swatch-picker';
import { createTag, toggleTagActive, deleteTag, type TagRow } from '@/lib/actions/tags';
import { tagChipStyle, TAG_COLOR_OPTS } from '@/lib/tag-colors';

const CATEGORY_LABEL: Record<string, string> = {
  origem: 'Origem',
  produto: 'Produto',
  outro: 'Outro',
};

const CATEGORY_ORDER = ['origem', 'produto', 'outro'];

// Swatches derivados da própria taxonomia de cores de tag (tag-colors.ts),
// usando o estilo real do chip pra cada cor como preview.
const TAG_SWATCHES: SwatchOption[] = TAG_COLOR_OPTS.map((c) => ({
  key: c,
  color: (tagChipStyle(c).background as string) ?? '#F1F5F9',
  label: c,
}));

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  // Preview ao vivo do chip no formulário de criação.
  const [previewLabel, setPreviewLabel] = React.useState('');
  const [previewColor, setPreviewColor] = React.useState<string>('slate');

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
      setPreviewLabel('');
      setPreviewColor('slate');
      router.refresh();
    } else setErr(res.error);
  }

  // Agrupa por categoria, mantendo a ordem origem → produto → outro.
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    tags: tags.filter((t) => t.category === cat),
  })).filter((g) => g.tags.length > 0);
  const ungrouped = tags.filter((t) => !CATEGORY_ORDER.includes(t.category));
  if (ungrouped.length > 0) {
    grouped.push({ cat: '__other', tags: ungrouped });
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {err}
        </div>
      )}

      {/* Clusters de chips por categoria */}
      <div className="space-y-5">
        {grouped.map(({ cat, tags: catTags }) => (
          <section key={cat}>
            <h2
              className="mb-2.5 text-[11px] font-bold uppercase"
              style={{ color: 'var(--i10-cyan-dark)', letterSpacing: '3px' }}
            >
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <div className="flex flex-wrap gap-2">
              {catTags.map((t) => (
                <div
                  key={t.id}
                  className={`group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 ${
                    t.isActive ? '' : 'opacity-50'
                  }`}
                >
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={tagChipStyle(t.color)}
                  >
                    {t.label}
                  </span>
                  {!t.isCustom && (
                    <span className="text-[10px] text-slate-400">padrão</span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-700"
                    title={t.isActive ? 'Desativar' : 'Ativar'}
                  >
                    {t.isActive ? 'desativar' : 'ativar'}
                  </button>
                  {t.isCustom && (
                    <button
                      type="button"
                      onClick={() => onDelete(t.id, t.label)}
                      className="text-[11px] font-medium text-rose-500 hover:text-rose-700"
                      title="Deletar"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!adding ? (
        <Button variant="accent" onClick={() => setAdding(true)}>
          + Adicionar tag
        </Button>
      ) : (
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="i10-eyebrow mb-2">Nova tag</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label">
              <Input
                name="label"
                required
                placeholder="ex: Município Bilíngue"
                value={previewLabel}
                onChange={(e) => setPreviewLabel(e.target.value)}
              />
            </Field>
            <Field label="Categoria">
              <Select name="category" defaultValue="outro">
                <option value="origem">Origem</option>
                <option value="produto">Produto</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Cor</label>
            <SwatchPicker
              name="color"
              value={previewColor}
              options={TAG_SWATCHES}
            />
            {/* Espelha a cor escolhida no preview. SwatchPicker mantém o valor
                real no input hidden 'color'; aqui só refletimos no chip. */}
            <SwatchMirror onChange={setPreviewColor} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Preview:</span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={tagChipStyle(previewColor)}
            >
              {previewLabel || 'Nome da tag'}
            </span>
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

/**
 * Lê o valor atual do input hidden `name="color"` do SwatchPicker irmão e
 * reporta mudanças para o preview. Mantemos SwatchPicker intacto (componente
 * compartilhado) e observamos seu input via evento de clique no container.
 */
function SwatchMirror({ onChange }: { onChange: (c: string) => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const root = ref.current?.parentElement;
    const input = root?.querySelector<HTMLInputElement>('input[name="color"]');
    if (!input || !root) return;
    const handler = () => onChange(input.value);
    root.addEventListener('click', handler);
    return () => root.removeEventListener('click', handler);
  }, [onChange]);
  return <span ref={ref} hidden />;
}
