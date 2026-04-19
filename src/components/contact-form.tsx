'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createContact } from '@/lib/actions/contacts';

export function ContactForm({ opportunityId }: { opportunityId: number }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set('opportunityId', String(opportunityId));
    const res = await createContact(fd);
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
        <Field label="Nome">
          <Input name="name" required placeholder="Ex. Maria Santos" />
        </Field>
        <Field label="Cargo">
          <Input name="role" placeholder="Ex. Secretária de Educação" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" placeholder="nome@municipio.gov.br" />
        </Field>
        <Field label="Telefone">
          <Input name="phone" placeholder="(00) 0000-0000" />
        </Field>
        <Field label="WhatsApp">
          <Input name="whatsapp" placeholder="(00) 00000-0000" />
        </Field>
        <Field label="Contato principal">
          <div className="flex items-center gap-2 mt-1.5">
            <input type="checkbox" name="isPrimary" id="isPrimary" className="h-4 w-4" />
            <label htmlFor="isPrimary" className="text-xs text-slate-700">
              Marcar como principal
            </label>
          </div>
        </Field>
      </div>
      <Field label="Notas">
        <Textarea name="notes" rows={2} />
      </Field>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      <div className="flex justify-end">
        <Button size="sm">Adicionar contato</Button>
      </div>
    </form>
  );
}
