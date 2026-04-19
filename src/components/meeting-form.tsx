'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createMeeting } from '@/lib/actions/meetings';

export function MeetingForm({ opportunityId }: { opportunityId: number }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [warn, setWarn] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  // useMemo keeps the default timestamp stable across re-renders and satisfies the
  // `react-hooks/purity` rule by reading the clock only once via an init function.
  const nowIso = React.useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().slice(0, 16);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setWarn(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set('opportunityId', String(opportunityId));
    const res = await createMeeting(fd);
    setPending(false);
    if (res?.ok) {
      formRef.current?.reset();
      if (res.calendarError) setWarn(res.calendarError);
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Título">
          <Input name="title" placeholder="Ex. Reunião com a Secretaria" />
        </Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue="contato_inicial">
            <option value="contato_inicial">Contato inicial</option>
            <option value="diagnostico">Apresentação diagnóstico</option>
            <option value="reuniao_auditoria">Reunião de auditoria</option>
            <option value="negociacao">Negociação</option>
            <option value="follow_up">Follow-up</option>
            <option value="outra">Outra</option>
          </Select>
        </Field>
        <Field label="Data/hora">
          <Input name="scheduledAt" type="datetime-local" required defaultValue={nowIso} />
        </Field>
        <Field label="Duração (min)">
          <Input name="durationMinutes" type="number" min={10} max={480} defaultValue={30} />
        </Field>
      </div>
      <Field label="Participantes (emails separados por vírgula)">
        <Input name="attendeesCsv" placeholder="secretario@municipio.gov.br, consultor@i10.org" />
      </Field>
      <Field label="Notas / pauta">
        <Textarea name="notes" rows={3} />
      </Field>
      <div className="flex items-center gap-6 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="sendCalendar" defaultChecked />
          Criar no Google Calendar
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="addMeet" defaultChecked />
          Adicionar link Meet
        </label>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {warn && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Reunião salva, mas Calendar falhou: {warn}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" disabled={pending}>
          {pending ? 'Agendando…' : 'Agendar reunião'}
        </Button>
      </div>
    </form>
  );
}
