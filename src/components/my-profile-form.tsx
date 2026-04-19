'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateMyProfile } from '@/lib/actions/me';

export function MyProfileForm({
  defaults,
}: {
  defaults: {
    googleName: string;
    email: string;
    displayName: string;
    phone: string;
    signature: string;
  };
}) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await updateMyProfile(fd);
    if (res?.ok) {
      setMsg('✓ Perfil atualizado');
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome do Google (read-only)">
          <Input value={defaults.googleName} readOnly className="bg-slate-50 text-slate-500" />
        </Field>
        <Field label="Email (read-only)">
          <Input value={defaults.email} readOnly className="bg-slate-50 text-slate-500" />
        </Field>
        <Field label="Nome de exibição (opcional)">
          <Input
            name="displayName"
            defaultValue={defaults.displayName}
            placeholder="Como você quer aparecer no CRM"
          />
        </Field>
        <Field label="Telefone / WhatsApp">
          <Input
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
            placeholder="(00) 00000-0000"
          />
        </Field>
      </div>
      <Field label="Assinatura (email/WhatsApp)">
        <Textarea
          name="signature"
          rows={4}
          defaultValue={defaults.signature}
          placeholder={`Ex:\n\nRaphael Ruiz\nConsultor i10\ntech@betteredu.com.br`}
        />
      </Field>
      <div className="flex items-center justify-between">
        <div className="text-xs">
          {msg && <span className="text-emerald-700">{msg}</span>}
          {err && <span className="text-rose-700">{err}</span>}
        </div>
        <Button>Salvar</Button>
      </div>
    </form>
  );
}
