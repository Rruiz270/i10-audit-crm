'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setOpportunityTaxonomyTags } from '@/lib/actions/tags';
import { tagChipStyle } from '@/lib/tag-colors';

type TaxonomyTag = { label: string; category: string; color: string };

const CATEGORY_LABEL: Record<string, string> = {
  origem: 'Origem',
  produto: 'Produto',
  outro: 'Outro',
};

export function TagEditor({
  opportunityId,
  initialTags,
  taxonomy,
}: {
  opportunityId: number;
  initialTags: string[];
  taxonomy: TaxonomyTag[];
}) {
  const router = useRouter();
  const [tags, setTags] = React.useState<string[]>(initialTags);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const taxonomyLabels = React.useMemo(() => new Set(taxonomy.map((t) => t.label)), [taxonomy]);
  const styleFor = React.useCallback(
    (label: string) => {
      const t = taxonomy.find((x) => x.label === label);
      return tagChipStyle(t?.color ?? 'slate');
    },
    [taxonomy],
  );

  async function save(next: string[]) {
    setBusy(true);
    // Separa o que é taxonomia (multi-select) do que é free-text.
    const selected = next.filter((t) => taxonomyLabels.has(t));
    const freeText = next.filter((t) => !taxonomyLabels.has(t));
    const fd = new FormData();
    fd.set('id', String(opportunityId));
    fd.set('selected', selected.join('\n'));
    fd.set('freeText', freeText.join(','));
    const res = await setOpportunityTaxonomyTags(fd);
    setBusy(false);
    if (res.ok) setTags(res.tags);
    router.refresh();
  }

  function toggle(label: string) {
    const next = tags.includes(label) ? tags.filter((t) => t !== label) : [...tags, label];
    setTags(next);
    void save(next);
  }

  function addFreeText(t: string) {
    const v = t.trim();
    if (!v || tags.includes(v)) return;
    const next = [...tags, v];
    setTags(next);
    setDraft('');
    void save(next);
  }

  // Agrupa taxonomia por categoria pra exibir em seções.
  const byCategory = React.useMemo(() => {
    const groups: Record<string, TaxonomyTag[]> = {};
    for (const t of taxonomy) (groups[t.category] ??= []).push(t);
    return groups;
  }, [taxonomy]);

  const freeTextTags = tags.filter((t) => !taxonomyLabels.has(t));

  return (
    <div className="space-y-3">
      {/* Tags atuais */}
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-xs text-slate-400 italic">Nenhuma tag ainda.</span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium"
            style={styleFor(t)}
          >
            {t}
            <button
              onClick={() => toggle(t)}
              disabled={busy}
              className="ml-0.5 opacity-60 hover:opacity-100"
              aria-label={`Remover ${t}`}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Multi-select da taxonomia, agrupado por categoria */}
      {Object.entries(byCategory).map(([cat, list]) => (
        <div key={cat}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {CATEGORY_LABEL[cat] ?? cat}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {list.map((t) => {
              const on = tags.includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(t.label)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    on ? 'border-transparent' : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                  }`}
                  style={on ? tagChipStyle(t.color) : undefined}
                >
                  {on ? '✓ ' : ''}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Free-text — tags fora da taxonomia */}
      <Field label="Tag livre (fora da taxonomia)">
        <div className="flex gap-2">
          <Input
            placeholder="ex: urgente, q2"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFreeText(draft);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => addFreeText(draft)}
            disabled={busy || !draft.trim()}
          >
            +
          </Button>
        </div>
      </Field>
      {freeTextTags.length > 0 && (
        <p className="text-[11px] text-slate-400">
          {freeTextTags.length} tag(s) livre(s) — não fazem parte da taxonomia gerenciada.
        </p>
      )}
    </div>
  );
}
