'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { handoffToFundeb } from '@/lib/actions/handoff';

/**
 * Botão de handoff expandido: abre um form inline com os campos que a
 * consultoria precisa pra nascer com data de início e duração corretas.
 */
export function HandoffButton({
  opportunityId,
  suggestedSecretary,
}: {
  opportunityId: number;
  suggestedSecretary?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  // Kickoff padrão: próxima segunda-feira (dia 1 é mais comum na prática)
  const defaultStart = React.useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set('opportunityId', String(opportunityId));
    const res = await handoffToFundeb(fd);
    setPending(false);
    if (res?.ok) {
      router.refresh();
      setOpen(false);
    } else {
      setErr(res?.error ?? 'Erro no handoff');
    }
  }

  if (!open) {
    return (
      <Button variant="success" onClick={() => setOpen(true)}>
        Transferir para BNCC-CAPTACAO →
      </Button>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-md p-5 w-[420px] space-y-4">
      <div>
        <div className="i10-eyebrow mb-1">Handshake com o sistema de auditoria</div>
        <div className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
          Agendar kickoff da consultoria
        </div>
        <p className="text-xs text-slate-500 mt-1">
          A consultoria nasce no BNCC-CAPTACAO com status <code>active</code>. A
          <strong> data de início</strong> é quando o ciclo de acompanhamento
          começa a contar — pode ser futura.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Data de início (kickoff)">
          <Input
            name="startDate"
            type="date"
            required
            defaultValue={defaultStart}
          />
        </Field>
        <Field label="Duração planejada">
          <Select name="durationMonths" defaultValue="12">
            <option value="6">6 meses</option>
            <option value="12">12 meses (padrão)</option>
            <option value="18">18 meses</option>
            <option value="24">24 meses</option>
          </Select>
        </Field>
        <Field label="Nome do secretário de educação (auto-preenchido)">
          <Input
            name="secretaryName"
            defaultValue={suggestedSecretary ?? ''}
            placeholder="Ex: Maria Santos"
          />
        </Field>

        {err && <div className="text-xs text-rose-600">{err}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="success" size="sm" disabled={pending}>
            {pending ? 'Transferindo…' : 'Confirmar e transferir'}
          </Button>
        </div>
      </form>
    </div>
  );
}
