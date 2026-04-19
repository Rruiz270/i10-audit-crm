'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { STAGES, STAGES_BY_KEY, type StageKey } from '@/lib/pipeline';
import { Button } from '@/components/ui/button';
import { Textarea, Field, Select } from '@/components/ui/input';
import { changeStageAction } from '@/lib/actions/opportunities';
import { LOST_REASONS, type LostReasonCode } from '@/lib/lost-reasons';

export function StageControl({
  opportunityId,
  currentStage,
}: {
  opportunityId: number;
  currentStage: StageKey;
}) {
  const router = useRouter();
  const [toStage, setToStage] = React.useState<StageKey>(currentStage);
  const [lostReason, setLostReason] = React.useState('');
  const [lostReasonCode, setLostReasonCode] = React.useState<LostReasonCode>('no_budget');
  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMissing([]);
    setPending(true);
    const fd = new FormData();
    fd.set('opportunityId', String(opportunityId));
    fd.set('toStage', toStage);
    if (lostReason) fd.set('lostReason', lostReason);
    if (toStage === 'perdido') fd.set('lostReasonCode', lostReasonCode);
    const res = await changeStageAction(fd);
    setPending(false);
    if (res?.ok) {
      router.refresh();
    } else {
      setError(res?.error ?? 'Falha ao mudar estágio');
      setMissing(res?.missing ?? []);
    }
  }

  const current = STAGES_BY_KEY[currentStage];

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Mover para">
        <Select value={toStage} onChange={(e) => setToStage(e.target.value as StageKey)}>
          {STAGES.filter((s) => s.key !== currentStage).map((s) => (
            <option key={s.key} value={s.key}>
              {s.order}. {s.label}
            </option>
          ))}
        </Select>
      </Field>

      {toStage === 'perdido' && (
        <>
          <Field label="Motivo da perda (picklist)">
            <Select
              value={lostReasonCode}
              onChange={(e) => setLostReasonCode(e.target.value as LostReasonCode)}
            >
              {LOST_REASONS.map((r) => (
                <option key={r.code} value={r.code} title={r.hint}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              lostReasonCode === 'other'
                ? 'Descreva o motivo (obrigatório p/ "Outro")'
                : 'Detalhes adicionais (opcional)'
            }
          >
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={2}
              placeholder="Contexto livre para complementar o picklist…"
            />
          </Field>
        </>
      )}

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          <div className="font-medium">{error}</div>
          {missing.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Atual: <span className="font-medium">{current?.label ?? currentStage}</span>
        </div>
        <Button size="sm" disabled={pending || toStage === currentStage}>
          {pending ? 'Salvando…' : 'Mover'}
        </Button>
      </div>
    </form>
  );
}
