'use client';

import * as React from 'react';
import { Icon } from '@/components/marketing-hub';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';
import {
  roleLabel,
  STATUS_TONE,
  type LeadRow,
} from '@/lib/actions/marketing/leads-types';

/**
 * Tabela do Leads Hub. Cada linha é clicável e abre um modal com os detalhes
 * do contato (e-mail, telefone, WhatsApp, município/UF e quem é — prefeito
 * pessoal, gabinete, secretaria de educação…). Os botões de canal continuam
 * funcionando sem disparar o modal (stopPropagation).
 */
export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [selected, setSelected] = React.useState<LeadRow | null>(null);

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Município/UF</th>
            <th className="px-4 py-3">Papel</th>
            <th className="px-4 py-3">Fonte</th>
            <th className="px-4 py-3">Canais</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => setSelected(r)}
              className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{r.name ?? r.email ?? '—'}</div>
                <div className="text-xs text-slate-400">{r.partido ?? roleLabel(r.role)}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.municipio ? `${r.municipio}${r.uf ? `/${r.uf}` : ''}` : r.uf ?? '—'}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {roleLabel(r.role)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-slate-500">{r.source ?? '—'}</span>
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className={r.email ? 'text-sky-600' : ''} title="E-mail">
                    <Icon name="mail" size={15} />
                  </span>
                  <span className={r.phone ? 'text-slate-600' : ''} title="Telefone">
                    <Icon name="phone" size={15} />
                  </span>
                  {r.whatsapp || r.phone ? (
                    <form action={startConversationWithContact} className="inline-flex">
                      <input type="hidden" name="contactId" value={r.id} />
                      <button
                        type="submit"
                        className="text-emerald-600 hover:text-emerald-700"
                        title="Iniciar conversa no inbox"
                      >
                        <Icon name="msg" size={15} />
                      </button>
                    </form>
                  ) : (
                    <span title="Sem WhatsApp/telefone">
                      <Icon name="msg" size={15} />
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                Nenhum contato encontrado com esse filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selected && (
        <LeadDetailModal row={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function LeadDetailModal({ row, onClose }: { row: LeadRow; onClose: () => void }) {
  // Fecha com Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const municipioUf = row.municipio
    ? `${row.municipio}${row.uf ? `/${row.uf}` : ''}`
    : row.uf ?? '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              className="truncate text-lg font-bold"
              style={{ color: 'var(--i10-navy)' }}
            >
              {row.name ?? row.email ?? 'Contato'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {roleLabel(row.role)}
              </span>
              {row.partido && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {row.partido}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_TONE[row.status] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {row.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Campos */}
        <dl className="mt-5 space-y-3">
          <Field icon="user" label="Quem é" value={roleLabel(row.role)} />
          <Field icon="flag" label="Município/UF" value={municipioUf} />
          <Field
            icon="mail"
            label="E-mail"
            value={row.email}
            href={row.email ? `mailto:${row.email}` : undefined}
          />
          <Field
            icon="phone"
            label="Telefone"
            value={row.phone}
            href={row.phone ? `tel:${row.phone}` : undefined}
          />
          <Field
            icon="msg"
            label="WhatsApp"
            value={row.whatsapp}
            href={
              row.whatsapp
                ? `https://wa.me/${row.whatsapp.replace(/\D/g, '')}`
                : undefined
            }
          />
          <Field icon="layers" label="Fonte" value={row.source} />
        </dl>

        {/* Ação */}
        {(row.whatsapp || row.phone) && (
          <form action={startConversationWithContact} className="mt-5">
            <input type="hidden" name="contactId" value={row.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
            >
              <Icon name="msg" size={16} />
              Iniciar conversa no inbox
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-400">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </dt>
        <dd className="text-sm text-slate-800">
          {value ? (
            href ? (
              <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="text-cyan-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </dd>
      </div>
    </div>
  );
}
