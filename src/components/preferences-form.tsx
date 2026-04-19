'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateMyPreferences, type UserPreferences } from '@/lib/actions/me';
import {
  requestNotificationPermission,
  notifyLocal,
} from '@/components/pwa-register';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Noronha',
  'America/Belem',
  'America/Cuiaba',
  'America/Fortaleza',
];

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}

export function PreferencesForm({ defaults }: { defaults: UserPreferences }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = React.useState<string>('idle');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await updateMyPreferences(fd);
    if (res?.ok) {
      setMsg('✓ Preferências salvas');
      router.refresh();
    } else {
      setErr(res?.error ?? 'Erro');
    }
  }

  async function askBrowserPerm() {
    setBrowserPermission('asking');
    const p = await requestNotificationPermission();
    setBrowserPermission(p);
    if (p === 'granted') {
      await notifyLocal(
        'Notificações ativadas 🔔',
        'Você vai ser avisado sobre tarefas atrasadas, novos leads e sinais do BNCC.',
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Notificações */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--i10-navy)' }}>
          Notificações
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          O CRM envia notificações locais (no navegador/PWA). Você pode ligar/desligar por tipo.
        </p>

        <div className="mb-3 p-3 rounded-md bg-slate-50 text-xs flex items-center justify-between">
          <span>
            Permissão do navegador:{' '}
            <strong
              className={
                browserPermission === 'granted'
                  ? 'text-emerald-700'
                  : browserPermission === 'denied'
                    ? 'text-rose-700'
                    : 'text-slate-700'
              }
            >
              {browserPermission === 'idle' ? 'não solicitada' : browserPermission}
            </strong>
          </span>
          {browserPermission !== 'granted' && browserPermission !== 'denied' && (
            <button
              type="button"
              onClick={askBrowserPerm}
              className="text-[var(--i10-cyan-dark)] font-semibold hover:underline"
            >
              Permitir no browser →
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          <Toggle
            name="notificationsEnabled"
            label="Notificações habilitadas (geral)"
            hint="Desativa tudo de uma vez — sobrepõe os toggles individuais abaixo."
            defaultChecked={defaults.notificationsEnabled}
          />
          <Toggle
            name="notifyTaskOverdue"
            label="Tarefas vencendo / atrasadas"
            hint="Avisa 1h antes do due_at e novamente se passar do prazo."
            defaultChecked={defaults.notifyTaskOverdue}
          />
          <Toggle
            name="notifyNewLead"
            label="Novos leads no formulário público"
            hint="Quando alguém preenche /intake/[slug] e uma oportunidade é criada."
            defaultChecked={defaults.notifyNewLead}
          />
          <Toggle
            name="notifyHandoffKickoff"
            label="Kickoff de consultoria se aproximando"
            hint="3 dias antes da data de início combinada no handoff."
            defaultChecked={defaults.notifyHandoffKickoff}
          />
          <Toggle
            name="notifyBnccSignals"
            label="Sinais do BNCC-CAPTACAO"
            hint="Novo relatório gerado, plano aprovado, evidência carregada nas suas consultorias."
            defaultChecked={defaults.notifyBnccSignals}
          />
        </div>
      </section>

      {/* Display / Pipeline */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
          Visual & pipeline
        </h2>
        <Field label="Filtro padrão em /pipeline e /opportunities">
          <Select name="defaultPipelineFilter" defaultValue={defaults.defaultPipelineFilter}>
            <option value="all">Todas (time inteiro)</option>
            <option value="mine">Só as minhas (ownerId = eu)</option>
          </Select>
        </Field>
        <Toggle
          name="displayCompact"
          label="Modo compacto"
          hint="Menos espaçamento em tabelas e cards — útil em tela pequena."
          defaultChecked={defaults.displayCompact}
        />
      </section>

      {/* Horário de trabalho */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
          Fuso & horário de trabalho
        </h2>
        <p className="text-xs text-slate-500">
          Usado pra sugestão de horários de reunião e pra evitar notificações fora do expediente.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Fuso horário">
            <Select name="timezone" defaultValue={defaults.timezone}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Início do expediente">
            <Input
              name="workingHoursStart"
              type="time"
              defaultValue={defaults.workingHoursStart ?? '09:00'}
            />
          </Field>
          <Field label="Fim do expediente">
            <Input
              name="workingHoursEnd"
              type="time"
              defaultValue={defaults.workingHoursEnd ?? '18:00'}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div className="text-xs">
          {msg && <span className="text-emerald-700">{msg}</span>}
          {err && <span className="text-rose-700">{err}</span>}
        </div>
        <Button size="lg">Salvar preferências</Button>
      </div>
    </form>
  );
}
