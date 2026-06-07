'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { triageLead } from '@/lib/actions/intake';

export type LeadCard = {
  id: number;
  formTitle: string | null;
  formId: number | null;
  submittedAt: string | null;
  triaged: boolean;
  opportunityId: number | null;
  // campos parseados no server (apresentação)
  name: string;
  local: string | null;
  role: string | null;
  entries: [string, string][];
};

export function LeadSubmissionCard({ s }: { s: LeadCard }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function markTriaged() {
    setPending(true);
    const fd = new FormData();
    fd.set('id', String(s.id));
    await triageLead(fd);
    setPending(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{s.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {s.local && <span>{s.local}</span>}
            {s.role && (
              <>
                {s.local && <span>·</span>}
                <span>{s.role}</span>
              </>
            )}
          </div>
        </div>
        <Chip tone={s.triaged ? 'mint' : 'amber'}>{s.triaged ? 'triado' : 'pendente'}</Chip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Chip tone="violet">{s.formTitle ?? `Form #${s.formId ?? '?'}`}</Chip>
        <span className="text-slate-400">
          {s.submittedAt ? new Date(s.submittedAt).toLocaleString('pt-BR') : '—'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Popover
          align="start"
          trigger={
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Icon name="file" size={14} /> Ver dados
            </span>
          }
          panelClassName="w-[22rem] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Dados da submissão
            </h4>
            {s.entries.length === 0 ? (
              <p className="text-xs text-slate-400">Sem campos.</p>
            ) : (
              <dl className="space-y-1">
                {s.entries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <dt className="w-28 shrink-0 font-medium text-slate-500">{k}</dt>
                    <dd className="min-w-0 break-words text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Popover>

        {s.opportunityId && (
          <Link
            href={`/opportunities/${s.opportunityId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-i10-700 hover:bg-slate-50"
          >
            Oportunidade #{s.opportunityId} <Icon name="arrow-right" size={13} />
          </Link>
        )}

        {!s.triaged && (
          <Button size="sm" variant="success" onClick={markTriaged} disabled={pending}>
            {pending ? 'Marcando…' : 'Marcar triado'}
          </Button>
        )}
      </div>
    </div>
  );
}
