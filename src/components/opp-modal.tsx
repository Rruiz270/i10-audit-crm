'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getOppCard, setOpportunityProduct, type OppCardData } from '@/lib/actions/opp-card';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';
import { PRODUCTS } from '@/lib/products';

// ─── Modal do card (layout do mockup master) ────────────────────────────────
// Abre ao clicar num card do kanban: abas Resumo | Propostas | Atividades,
// barra de ações 💬✉️📞 + última interação, produto e "Marcar como Ganhou".

const STAGE_PT: Record<string, string> = {
  novo: 'Novo',
  contato_inicial: 'Oportunidades',
  diagnostico_enviado: 'Diagnóstico Enviado',
  follow_up: 'Follow-up',
  reuniao_auditoria: 'Reunião de Auditoria',
  negociacao: 'Negociação',
  ganhou: 'Ganhou',
  perdido: 'Perdido',
};
const PROP_STATUS: Record<string, string> = {
  rascunho: 'bg-slate-100 text-slate-500',
  enviada: 'bg-cyan-50 text-cyan-700',
  aceita: 'bg-emerald-50 text-emerald-700',
  recusada: 'bg-rose-50 text-rose-600',
};

function ago(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'agora';
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function OppModal({
  oppId,
  onClose,
  onWon,
}: {
  oppId: number;
  onClose: () => void;
  onWon: (data: OppCardData) => void;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<OppCardData | null>(null);
  const [tab, setTab] = React.useState<'resumo' | 'propostas' | 'atividades'>('resumo');
  const [savingProd, setSavingProd] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getOppCard(oppId).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [oppId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const money = (v: number | null) =>
    v != null
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      : '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/55 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--i10-navy)' }}>
              {data?.municipality ?? `Oportunidade`}{' '}
              <span className="text-sm font-medium text-slate-400">#{oppId}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {data
                ? `${STAGE_PT[data.stage] ?? data.stage} · ${money(data.estimatedValue)} · dono(a): ${data.ownerName ?? '—'}`
                : 'carregando…'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 px-6">
          {(
            [
              ['resumo', 'Resumo'],
              ['propostas', 'Propostas'],
              ['atividades', 'Atividades'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${
                tab === k
                  ? 'border-cyan-400 text-i10-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              {k === 'propostas' && data && data.proposals.length > 0 && (
                <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-700">
                  {data.proposals.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-6 py-5">
          {!data ? (
            <div className="py-10 text-center text-sm text-slate-400">Carregando…</div>
          ) : tab === 'resumo' ? (
            <>
              {/* Barra de ações */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                {data.primaryContact?.marketingContactId &&
                (data.primaryContact.whatsapp || data.primaryContact.phone) ? (
                  <form action={startConversationWithContact}>
                    <input
                      type="hidden"
                      name="contactId"
                      value={data.primaryContact.marketingContactId}
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      💬 WhatsApp
                    </button>
                  </form>
                ) : (
                  <span className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-400">
                    💬 sem WhatsApp
                  </span>
                )}
                {data.primaryContact?.email && (
                  <a
                    href={`mailto:${data.primaryContact.email}`}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400"
                  >
                    ✉️ E-mail
                  </a>
                )}
                {(data.primaryContact?.whatsapp || data.primaryContact?.phone) && (
                  <a
                    href={`tel:${(data.primaryContact.whatsapp ?? data.primaryContact.phone ?? '').replace(/[^+\d]/g, '')}`}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400"
                  >
                    📞 Ligar
                  </a>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {data.lastInteraction ? (
                    <>
                      <span className="mr-1 inline-block h-4 w-4 rounded bg-emerald-100 text-center text-[10px] leading-4">
                        💬
                      </span>
                      última interação: {data.lastInteraction.label}{' '}
                      <span className="text-slate-400">{ago(data.lastInteraction.at)}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-rose-500">nunca contactado</span>
                  )}
                </span>
              </div>

              {/* KV */}
              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex items-baseline gap-4">
                  <dt className="w-36 shrink-0 font-semibold text-slate-400">Contato principal</dt>
                  <dd className="text-slate-800">
                    {data.primaryContact
                      ? `${data.primaryContact.role ? `${data.primaryContact.role} — ` : ''}${data.primaryContact.name}`
                      : '—'}
                    {data.primaryContact?.marketingContactId && (
                      <Link
                        href={`/contacts/${data.primaryContact.marketingContactId}`}
                        className="ml-2 font-bold text-cyan-700 underline"
                      >
                        → Ficha 360
                      </Link>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline gap-4">
                  <dt className="w-36 shrink-0 font-semibold text-slate-400">Valor estimado</dt>
                  <dd className="text-slate-800">{money(data.estimatedValue)}</dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="w-36 shrink-0 font-semibold text-slate-400">
                    Produto{' '}
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                      novo
                    </span>
                  </dt>
                  <dd>
                    <select
                      defaultValue={data.products[0] ?? ''}
                      disabled={savingProd}
                      onChange={async (e) => {
                        setSavingProd(true);
                        await setOpportunityProduct({
                          opportunityId: oppId,
                          product: e.target.value,
                        });
                        setSavingProd(false);
                        router.refresh();
                      }}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        — escolher —
                      </option>
                      {PRODUCTS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>

              {/* Ações */}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ações
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.stage !== 'ganhou' && data.stage !== 'perdido' && (
                    <button
                      onClick={() => onWon(data)}
                      className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-500"
                    >
                      ✓ Marcar como Ganhou
                    </button>
                  )}
                  <Link
                    href={`/opportunities/${oppId}`}
                    className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Agendar reunião
                  </Link>
                  <Link
                    href={`/opportunities/${oppId}`}
                    className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Abrir completa →
                  </Link>
                </div>
              </div>
            </>
          ) : tab === 'propostas' ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Link
                  href={`/opportunities/${oppId}/proposta`}
                  className="rounded-md bg-i10-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-i10-800"
                >
                  ＋ Nova proposta (prefill do card)
                </Link>
                <span className="text-[11px] text-slate-400">gerada dentro do CRM</span>
              </div>
              {data.proposals.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                  Nenhuma proposta ainda.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Nº / versão</th>
                        <th className="px-3 py-2">Produtos</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.proposals.map((pr) => (
                        <tr key={pr.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-semibold" style={{ color: 'var(--i10-navy)' }}>
                            {pr.number} · v{pr.version}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex flex-wrap gap-1">
                              {pr.products.map((prod) => (
                                <span
                                  key={prod}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
                                >
                                  {prod}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PROP_STATUS[pr.status] ?? PROP_STATUS.rascunho}`}
                            >
                              {pr.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{money(pr.total)}</td>
                          <td className="px-3 py-2 text-right">
                            <a
                              href={`/proposta/${pr.id}`}
                              className="rounded bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-700 hover:bg-cyan-100"
                            >
                              Ver / PDF
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {data.activities.length === 0 && (
                <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                  Nenhuma atividade ainda.
                </p>
              )}
              {data.activities.map((a, i) => (
                <div key={i} className="flex items-baseline gap-3 border-b border-slate-100 pb-2.5 text-sm last:border-0">
                  <span className="w-16 shrink-0 text-[11px] text-slate-400">
                    {new Date(a.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-slate-700">{a.subject ?? a.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
