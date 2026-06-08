'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { editMessage, deleteMessage, restoreMessage } from '@/lib/actions/marketing/conversations';

// Corpo de uma mensagem do thread + (para moderadores) ações editar/apagar.
// Edição/exclusão são SÓ no CRM — não mexem na mensagem já entregue no WhatsApp
// do contato. Soft-delete mostra "mensagem apagada" e permite restaurar.
export function MessageBody({
  messageId,
  body,
  edited,
  deleted,
  canModerate,
  hideBody,
}: {
  messageId: number;
  body: string | null;
  edited: boolean;
  deleted: boolean;
  canModerate: boolean;
  hideBody: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body ?? '');
  const [err, setErr] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string } | void>) {
    startTransition(async () => {
      setErr(null);
      try {
        const r = await action();
        if (r && !r.ok) {
          setErr(r.error ?? 'Falhou.');
          return;
        }
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Falhou.');
      }
    });
  }

  // Apagada (soft-delete) — placeholder visível para todos; restaurar só admin.
  if (deleted) {
    return (
      <div className="flex items-center gap-2 text-sm italic text-slate-400">
        <span>mensagem apagada</span>
        {canModerate && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set('messageId', String(messageId));
              run(() => restoreMessage(fd));
            }}
            className="text-[11px] not-italic text-cyan-700 hover:underline disabled:opacity-50"
          >
            restaurar
          </button>
        )}
      </div>
    );
  }

  // Edição inline.
  if (editing) {
    return (
      <div className="space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          className="w-full min-w-[14rem] resize-none rounded-md border border-slate-300 p-1.5 text-sm"
        />
        {err && <div className="text-[11px] font-medium text-rose-600">{err}</div>}
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setEditing(false);
              setDraft(body ?? '');
              setErr(null);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending || !draft.trim()}
            onClick={() => {
              const fd = new FormData();
              fd.set('messageId', String(messageId));
              fd.set('body', draft);
              run(() => editMessage(fd));
            }}
            className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {body && !hideBody && (
        <div className="whitespace-pre-wrap break-words">
          {body}
          {edited && (
            <span className="ml-1 align-baseline text-[10px] italic text-slate-400">(editada)</span>
          )}
        </div>
      )}
      {canModerate && (
        <div className="absolute -top-3 right-1 hidden gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex">
          <button
            type="button"
            title="Editar (só no CRM)"
            onClick={() => {
              setDraft(body ?? '');
              setEditing(true);
            }}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Apagar (só no CRM)"
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set('messageId', String(messageId));
              run(() => deleteMessage(fd));
            }}
            className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
