'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createOpportunity, type CreateOpportunityState } from '@/lib/actions/opportunities';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { AdvancedOptions } from '@/components/advanced-options';
import { MunicipalityPicker } from '@/components/municipality-picker';

type Municipality = { id: number; nome: string; uf?: string | null; regiao?: string | null };

/**
 * Form de criação com useActionState: erro da action (validação/duplicata)
 * aparece inline e os campos digitados voltam via defaultValue (o React reseta
 * inputs não controlados após a action — repovoamos com state.values). O
 * MunicipalityPicker mantém a seleção sozinho: seu hidden input é controlado.
 */
export function NewOpportunityForm({
  municipalities,
  defaultMunicipalityId,
  municipalityHint,
  defaultSource,
  withContact,
  contact,
}: {
  municipalities: Municipality[];
  defaultMunicipalityId: number | null;
  municipalityHint: string;
  defaultSource: string;
  withContact: boolean;
  contact: { name: string; role: string; phone: string; email: string };
}) {
  const [state, formAction, pending] = useActionState<CreateOpportunityState, FormData>(
    createOpportunity,
    null,
  );
  const v = state?.values;

  return (
    <form action={formAction} className="space-y-5 bg-white p-6 border border-slate-200 rounded-2xl">
      {state?.error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {state.error}
        </div>
      )}

      <Field label="Município">
        <MunicipalityPicker
          name="municipalityId"
          municipalities={municipalities}
          defaultValue={defaultMunicipalityId}
        />
        <p className="text-xs text-slate-500 mt-1">{municipalityHint}</p>
      </Field>

      {withContact && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Contato principal</div>
          <input type="hidden" name="withContact" value="1" />
          <Field label="Nome"><Input name="contactName" defaultValue={v?.contactName ?? contact.name} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo"><Input name="contactRole" defaultValue={v?.contactRole ?? contact.role} placeholder="Ex.: Secretário(a) de Educação" /></Field>
            <Field label="WhatsApp / telefone"><Input name="contactPhone" defaultValue={v?.contactPhone ?? contact.phone} /></Field>
          </div>
          <Field label="E-mail"><Input name="contactEmail" type="email" defaultValue={v?.contactEmail ?? contact.email} /></Field>
        </div>
      )}

      <Field label="Fonte do lead">
        <Input
          name="source"
          defaultValue={v?.source ?? defaultSource}
          placeholder='Ex. "formulário /intake/fundeb", "APM", "indicação"'
        />
      </Field>
      <Field label="Valor estimado (R$)">
        <Input type="number" step="0.01" name="estimatedValue" defaultValue={v?.estimatedValue} placeholder="0,00" />
      </Field>
      <Field label="Observações iniciais">
        <Textarea name="notes" rows={4} defaultValue={v?.notes} placeholder="Contexto, como chegou, próximos passos…" />
      </Field>

      {/* Opções avançadas — duplicata recolhida. O conteúdo fica sempre montado
          (só escondido), então o checkbox segue sendo submetido pela action. */}
      <AdvancedOptions>
        <label className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <input
            type="checkbox"
            name="allowDuplicate"
            defaultChecked={v?.allowDuplicate}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span>
            <strong className="block text-amber-800">Permitir duplicada</strong>
            Por padrão, o sistema bloqueia criar uma nova oportunidade quando o
            município já tem uma oportunidade ativa. Marque só se souber o que está
            fazendo (ex: segundo órgão no mesmo município).
          </span>
        </label>
      </AdvancedOptions>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link href="/opportunities"><Button variant="secondary" type="button">Cancelar</Button></Link>
        <Button type="submit" disabled={pending}>
          {pending ? 'Criando…' : 'Criar oportunidade'}
        </Button>
      </div>
    </form>
  );
}
