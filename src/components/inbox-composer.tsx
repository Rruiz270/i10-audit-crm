'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { sendConversationReply, sendTemplateReply } from '@/lib/actions/marketing/conversations';

const EMOJIS = [
  '😀', '😁', '😉', '😊', '🙂', '😍', '👍', '👏',
  '🙏', '🤝', '💪', '✅', '❤️', '🔥', '🎉', '⭐',
  '📅', '📌', '📞', '📈', '💡', '⚠️', '👋', '🚀',
];

type Canned = { id: number; title: string; body: string };
type ApprovedTemplate = { contentSid: string; name: string };

export function InboxComposer({
  conversationId,
  windowExpired,
  cannedResponses,
  approvedTemplates,
}: {
  conversationId: number;
  windowExpired: boolean;
  cannedResponses: Canned[];
  approvedTemplates: ApprovedTemplate[];
}) {
  const [body, setBody] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popoversRef = useRef<HTMLDivElement>(null);

  // Fecha emoji / respostas rápidas ao clicar fora ou apertar Escape.
  useEffect(() => {
    if (!emojiOpen && !cannedOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (popoversRef.current && !popoversRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
        setCannedOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setEmojiOpen(false);
        setCannedOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiOpen, cannedOpen]);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) {
      setBody((b) => b + text);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    // recoloca o cursor após o texto inserido
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function submitFreeform() {
    if (!body.trim() || isPending) return;
    setError(null);
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('body', body);
    startTransition(async () => {
      try {
        await sendConversationReply(fd);
        setBody('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar.');
      }
    });
  }

  function submitTemplate(contentSid: string) {
    if (isPending) return;
    setError(null);
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('contentSid', contentSid);
    startTransition(async () => {
      try {
        await sendTemplateReply(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar template.');
      }
    });
  }

  // ── Fora da janela de 24h: só template aprovado ──
  if (windowExpired) {
    return (
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="mb-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <b>Janela de 24h expirada</b> — mensagem livre bloqueada (regra da Meta).
          Para reabrir a conversa, envie um <b>template aprovado</b>.
        </div>
        {error && <div className="mb-2 text-xs font-medium text-rose-600">{error}</div>}
        {approvedTemplates.length === 0 ? (
          <div className="text-xs text-slate-500">
            Nenhum template aprovado disponível para este projeto. Crie e aprove um template
            WhatsApp na Meta para reabrir conversas fora da janela.
          </div>
        ) : (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Templates Meta aprovados
            </div>
            <div className="flex flex-col gap-1.5">
              {approvedTemplates.map((t) => (
                <button
                  key={t.contentSid}
                  type="button"
                  disabled={isPending}
                  onClick={() => submitTemplate(t.contentSid)}
                  className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="font-medium text-slate-800">{t.name}</span>
                  <span className="text-xs text-cyan-700">Enviar</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Dentro da janela: freeform + emoji + respostas rápidas ──
  return (
    <div className="relative border-t border-slate-200 bg-white p-3">
      {error && <div className="mb-2 text-xs font-medium text-rose-600">{error}</div>}

      <textarea
        ref={taRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitFreeform();
          }
        }}
        placeholder="Resposta (mensagem livre, dentro da janela de 24h)…"
        className="h-14 w-full resize-none rounded-lg border border-slate-300 p-2.5 text-sm"
      />

      <div className="mt-2 flex items-center justify-between">
        <div ref={popoversRef} className="flex items-center gap-2">
          {/* Emoji */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setEmojiOpen((v) => !v);
                setCannedOpen(false);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              title="Emojis"
            >
              😊
            </button>
            {emojiOpen && (
              <div className="absolute bottom-full left-0 z-10 mb-1 grid w-56 grid-cols-8 gap-0.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      insertAtCursor(em);
                      setEmojiOpen(false);
                    }}
                    className="rounded p-1 text-lg hover:bg-slate-100"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Respostas rápidas */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setCannedOpen((v) => !v);
                setEmojiOpen(false);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Respostas rápidas
            </button>
            {cannedOpen && (
              <div className="absolute bottom-full left-0 z-10 mb-1 max-h-72 w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {cannedResponses.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">Nenhuma resposta rápida cadastrada.</div>
                ) : (
                  cannedResponses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        insertAtCursor((body && !body.endsWith(' ') ? ' ' : '') + c.body);
                        setCannedOpen(false);
                      }}
                      className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-slate-50"
                    >
                      <div className="text-sm font-medium text-slate-800">{c.title}</div>
                      <div className="truncate text-xs text-slate-500">{c.body}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={submitFreeform}
          disabled={isPending || !body.trim()}
          className="rounded-md bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#06223e] disabled:opacity-50"
        >
          {isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
