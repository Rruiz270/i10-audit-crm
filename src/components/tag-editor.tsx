'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setOpportunityTags } from '@/lib/actions/opportunities';

const SUGGESTED = ['vaat', 'vaar', 'fundeb-basico', 'fundeb-avancado', 'urgente', 'high-value', 'follow-up-q2'];

export function TagEditor({
  opportunityId,
  initialTags,
}: {
  opportunityId: number;
  initialTags: string[];
}) {
  const router = useRouter();
  const [tags, setTags] = React.useState<string[]>(initialTags);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function save(next: string[]) {
    setBusy(true);
    const fd = new FormData();
    fd.set('id', String(opportunityId));
    fd.set('tags', next.join(','));
    await setOpportunityTags(fd);
    setBusy(false);
    router.refresh();
  }

  function addTag(t: string) {
    const normalized = t.trim().toLowerCase();
    if (!normalized || tags.includes(normalized)) return;
    const next = [...tags, normalized];
    setTags(next);
    setDraft('');
    void save(next);
  }

  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void save(next);
  }

  const suggestions = SUGGESTED.filter((s) => !tags.includes(s)).slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-xs text-slate-400 italic">Nenhuma tag ainda.</span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-i10-50 text-i10-800"
          >
            {t}
            <button
              onClick={() => removeTag(t)}
              disabled={busy}
              className="text-i10-400 hover:text-rose-600 ml-0.5"
              aria-label={`Remover ${t}`}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Field label="Adicionar tag">
        <div className="flex gap-2">
          <Input
            placeholder="ex: vaat, urgente, q2"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(draft);
              }
            }}
          />
          <Button type="button" size="sm" onClick={() => addTag(draft)} disabled={busy || !draft.trim()}>
            +
          </Button>
        </div>
      </Field>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          <span className="text-slate-500">Sugestões:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              disabled={busy}
              className="px-1.5 py-0.5 rounded hover:bg-slate-100 text-slate-600"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
