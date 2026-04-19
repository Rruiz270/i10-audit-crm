'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createActivity } from '@/lib/actions/activities';

export function ActivityForm({ opportunityId }: { opportunityId: number }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set('opportunityId', String(opportunityId));
    const res = await createActivity(fd);
    if (res?.ok) {
      formRef.current?.reset();
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select name="type" required defaultValue="note">
            <option value="note">Nota</option>
            <option value="call">Ligação</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="diagnostic_sent">Diagnóstico enviado</option>
            <option value="proposal_sent">Proposta enviada</option>
            <option value="contract_signed">Contrato assinado</option>
            <option value="lost">Perda registrada</option>
          </Select>
        </Field>
        <Field label="Assunto">
          <Input name="subject" placeholder="Breve título" />
        </Field>
      </div>
      <Field label="Conteúdo">
        <Textarea name="body" rows={3} placeholder="Registre a interação…" />
      </Field>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      <div className="flex justify-end">
        <Button size="sm">Registrar</Button>
      </div>
    </form>
  );
}
