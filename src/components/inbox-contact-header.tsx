'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Popover } from '@/components/ui/popover';
import {
  searchContacts,
  startConversationWithContact,
  createContactQuick,
  type ContactSearchResult,
} from '@/lib/actions/marketing/inbox-contacts';

// ─── Header do inbox (admin/gestor) — buscar contato + novo contato ─────────
// Renderizado acima da lista de conversas. Não interfere no grid 3-panes nem
// no auto-refresh: é só conteúdo dentro do painel esquerdo.

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-slate-400" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="m14 14 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function InboxContactHeader() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [isStarting, startStart] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounce da busca de contatos.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => {
        try {
          const rows = await searchContacts(term);
          setResults(rows);
          setOpen(true);
        } catch {
          setResults([]);
        }
      });
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  // Fecha o dropdown ao clicar fora / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function start(r: ContactSearchResult) {
    if (isStarting) return;
    const fd = new FormData();
    fd.set('contactId', String(r.id));
    if (r.whatsapp ?? r.phone) fd.set('phone', String(r.whatsapp ?? r.phone));
    startStart(async () => {
      // startConversationWithContact faz redirect (lança NEXT_REDIRECT) — não
      // tratamos como erro; a navegação acontece via Server Action.
      await startConversationWithContact(fd);
    });
  }

  return (
    <div className="space-y-2">
      {/* Busca de contatos */}
      <div ref={rootRef} className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-1.5">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Buscar contato (nome ou telefone)…"
            className="min-w-0 flex-1 text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        {open && (
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {isSearching ? (
              <div className="p-3 text-xs text-slate-500">Buscando…</div>
            ) : results.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">Nenhum contato encontrado.</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={isStarting}
                  onClick={() => start(r)}
                  className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {r.name ?? 'Sem nome'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.whatsapp ?? r.phone ?? '—'}
                      {r.municipio ? ` · ${r.municipio}${r.uf ? `/${r.uf}` : ''}` : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.hasConversation
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {r.hasConversation ? 'abrir' : 'iniciar'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Novo contato */}
      <Popover
        align="start"
        trigger={
          <span className="flex items-center gap-1.5">
            <PlusIcon />
            Novo contato
          </span>
        }
        triggerClassName="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        panelClassName="w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      >
        {({ close }) => (
          <form action={createContactQuick} onSubmit={() => close()} className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Novo contato
            </div>
            <input
              name="name"
              required
              placeholder="Nome"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="phone"
              required
              placeholder="Telefone (+55…)"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="email"
              type="email"
              placeholder="E-mail (opcional)"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-gradient-to-r from-cyan-500 to-emerald-400 px-3 py-1.5 text-sm font-semibold text-[#06223e]"
            >
              Criar e iniciar conversa
            </button>
          </form>
        )}
      </Popover>
    </div>
  );
}
