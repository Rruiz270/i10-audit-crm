'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea, Field, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { createMeeting } from '@/lib/actions/meetings';

type OpportunityOption = { id: number; municipalityName: string | null };

// Popover "+ Agendar reunião" para a página de listagem: reusa a action
// createMeeting verbatim, apenas adicionando o seletor de oportunidade (já que
// fora do detalhe não há opportunityId no contexto).
export function MeetingScheduler({ opportunities }: { opportunities: OpportunityOption[] }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [warn, setWarn] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const nowIso = React.useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().slice(0, 16);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>, close: () => void) {
    e.preventDefault();
    setErr(null);
    setWarn(null);
    setPending(true);
    const res = await createMeeting(new FormData(e.currentTarget));
    setPending(false);
    if (res?.ok) {
      formRef.current?.reset();
      if (res.calendarError) setWarn(res.calendarError);
      else close();
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  return (
    <Popover
      align="end"
      trigger={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-i10-cyan to-i10-mint px-4 py-2 text-sm font-semibold text-i10-navy-dark shadow-sm">
          <Icon name="plus" size={16} /> Agendar reunião
        </span>
      }
      panelClassName="w-[28rem] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      {({ close }) => (
        <form ref={formRef} onSubmit={(e) => onSubmit(e, close)} className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
            Agendar reunião
          </h3>
          <Field label="Oportunidade">
            <Select name="opportunityId" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.municipalityName ?? `#${o.id}`}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
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
            <Input name="attendeesCsv" placeholder="secretario@municipio.gov.br" />
          </Field>
          <Field label="Notas / pauta">
            <Textarea name="notes" rows={2} />
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
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              Reunião salva, mas Calendar falhou: {warn}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pending}>
              {pending ? 'Agendando…' : 'Agendar reunião'}
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}
