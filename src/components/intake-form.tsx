'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { submitIntake, type FieldDef } from '@/lib/actions/intake';

export function IntakeForm({
  slug,
  fields,
}: {
  slug: string;
  fields: FieldDef[];
}) {
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set('_slug', slug);
    const res = await submitIntake(fd);
    setPending(false);
    if (res?.ok) setDone(true);
    else setErr(res?.error ?? 'Erro ao enviar.');
  }

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-md p-6 text-center">
        <div className="text-lg font-semibold text-emerald-900">Recebido!</div>
        <p className="text-sm text-emerald-800 mt-1">
          Nossa equipe entrará em contato em breve. Obrigado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* honeypot */}
      <div className="hidden" aria-hidden>
        <label>
          Não preencha:
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {fields.map((f) => (
        <Field key={f.name} label={f.label + (f.required ? ' *' : '')} hint={f.help}>
          {f.type === 'textarea' ? (
            <Textarea name={f.name} rows={4} required={f.required} />
          ) : f.type === 'select' ? (
            <Select name={f.name} required={f.required}>
              <option value="">—</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
              name={f.name}
              required={f.required}
            />
          )}
        </Field>
      ))}

      {err && <div className="text-xs text-rose-600">{err}</div>}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? 'Enviando…' : 'Enviar'}
      </Button>
    </form>
  );
}
