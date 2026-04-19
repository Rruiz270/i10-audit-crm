'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MunicipalityPicker } from '@/components/municipality-picker';
import { updateOpportunity } from '@/lib/actions/opportunities';

type Op = {
  id: number;
  municipalityId: number | null;
  source: string | null;
  estimatedValue: number | null;
  closeDate: Date | null;
  contractSigned: boolean | null;
  contractNotes: string | null;
  notes: string | null;
};

export function OpportunityEditForm({
  opportunity,
  municipalities,
}: {
  opportunity: Op;
  municipalities: Array<{ id: number; nome: string; regiao?: string | null }>;
}) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set('id', String(opportunity.id));
    const res = await updateOpportunity(fd);
    if (res?.ok) {
      setMsg('Salvo');
      router.refresh();
    } else {
      setMsg(res?.error ?? 'Erro');
    }
  }

  const closeDateIso = opportunity.closeDate
    ? new Date(opportunity.closeDate).toISOString().slice(0, 10)
    : '';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Município">
        <MunicipalityPicker
          name="municipalityId"
          municipalities={municipalities}
          defaultValue={opportunity.municipalityId}
        />
      </Field>
      <Field label="Fonte">
        <Input name="source" defaultValue={opportunity.source ?? ''} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor estimado (R$)">
          <Input
            type="number"
            step="0.01"
            name="estimatedValue"
            defaultValue={opportunity.estimatedValue ?? ''}
          />
        </Field>
        <Field label="Data prevista de fechamento">
          <Input type="date" name="closeDate" defaultValue={closeDateIso} />
        </Field>
      </div>
      <Field label="Contrato">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="contractSigned"
            id="contractSigned"
            defaultChecked={!!opportunity.contractSigned}
            className="h-4 w-4 text-i10-600 focus:ring-i10-500 border-slate-300 rounded"
          />
          <label htmlFor="contractSigned" className="text-sm text-slate-700">
            Contrato assinado
          </label>
        </div>
      </Field>
      <Field label="Notas do contrato">
        <Textarea name="contractNotes" rows={2} defaultValue={opportunity.contractNotes ?? ''} />
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={4} defaultValue={opportunity.notes ?? ''} />
      </Field>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-500">{msg}</div>
        <Button>Salvar alterações</Button>
      </div>
    </form>
  );
}
