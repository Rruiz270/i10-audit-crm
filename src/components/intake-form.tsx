'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { submitIntake, type FieldDef } from '@/lib/actions/intake';
import type { Diagnostico } from '@/lib/prospecting';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function IntakeForm({
  slug,
  fields,
}: {
  slug: string;
  fields: FieldDef[];
}) {
  const [done, setDone] = React.useState(false);
  const [diagnostico, setDiagnostico] = React.useState<Diagnostico | null>(null);
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
    if (res?.ok) {
      setDiagnostico('diagnostico' in res ? (res.diagnostico ?? null) : null);
      setDone(true);
    } else setErr(res?.error ?? 'Erro ao enviar.');
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-6 text-center">
          <div className="text-lg font-semibold text-emerald-900">Recebido!</div>
          <p className="text-sm text-emerald-800 mt-1">
            Nossa equipe entrará em contato em breve. Obrigado.
          </p>
        </div>

        {diagnostico && (
          <div className="rounded-md border border-cyan-200 bg-cyan-50 p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-700">
              Diagnóstico gratuito · FUNDEB
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {diagnostico.municipio}
              {diagnostico.uf ? `/${diagnostico.uf}` : ''}
              {diagnostico.anoReferencia ? ` · dados ${diagnostico.anoReferencia}` : ''}
            </div>
            {diagnostico.valorEstimado != null && (
              <p className="mt-3 text-sm text-slate-800">
                Estimamos um potencial de até{' '}
                <b className="text-cyan-800">{brl(diagnostico.valorEstimado)}/ano</b> em recursos
                do FUNDEB a recuperar ou incrementar via auditoria.
              </p>
            )}
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {diagnostico.matriculas != null && (
                <li>• {diagnostico.matriculas.toLocaleString('pt-BR')} matrículas na rede municipal</li>
              )}
              {diagnostico.receitaFundeb != null && (
                <li>• Receita FUNDEB de {brl(diagnostico.receitaFundeb)}/ano</li>
              )}
              {diagnostico.recebeVaat && <li>• Recebe complementação VAAT da União</li>}
              {diagnostico.recebeVaar && <li>• Recebe complementação VAAR da União</li>}
            </ul>
            <p className="mt-3 text-[11px] text-slate-500">
              Estimativa preliminar com base em dados públicos (FNDE/SIOPE). O diagnóstico completo
              é apresentado pela nossa equipe.
            </p>
          </div>
        )}
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
