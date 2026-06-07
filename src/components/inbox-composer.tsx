'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Paperclip } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import {
  sendConversationReply,
  sendTemplateReply,
  sendAudioReply,
  sendMediaUrlReply,
} from '@/lib/actions/marketing/conversations';

// Teto de upload (browser → Vercel Blob client-direct). Espelha
// MEDIA_MAX_UPLOAD_BYTES no server; pré-checagem só p/ UX (real é server-side).
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Tipos aceitos no <input accept> + drag-drop. Espelha MEDIA_ALLOWED_TYPES no
// server (a validação real é server-side; isto é só UX).
const FILE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'video/mp4',
].join(',');

// Escolhe o melhor mimeType de gravação suportado. WhatsApp só renderiza bolha
// nativa de voice note pra audio/ogg;codecs=opus — preferimos ogg quando o
// browser suporta; senão caímos pra webm (Twilio aceita, mas pode virar anexo).
function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const prefs = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const m of prefs) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

const EMOJIS = [
  '😀', '😁', '😉', '😊', '🙂', '😍', '👍', '👏',
  '🙏', '🤝', '💪', '✅', '❤️', '🔥', '🎉', '⭐',
  '📅', '📌', '📞', '📈', '💡', '⚠️', '👋', '🚀',
];

type Canned = { id: number; title: string; body: string };
type ApprovedTemplate = { contentSid: string; name: string };

const VAR_LABELS = ['Nome', 'Município'];

// Mini-form de variáveis de um template. Pré-preenchido com os defaults do
// contato (editáveis). Ao enviar chama onSend com os valores na ordem var_1..N.
function TemplateVarForm({
  template,
  defaults,
  disabled,
  onSend,
  onCancel,
}: {
  template: ApprovedTemplate;
  defaults: string[];
  disabled: boolean;
  onSend: (vars: string[]) => void;
  onCancel: () => void;
}) {
  const [vars, setVars] = useState<string[]>(defaults);
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-800">{template.name}</div>
      {vars.map((v, i) => (
        <label key={i} className="block">
          <span className="text-[11px] font-medium text-slate-500">
            {VAR_LABELS[i] ?? `Variável ${i + 1}`}
          </span>
          <input
            value={v}
            disabled={disabled}
            onChange={(e) =>
              setVars((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
            }
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
      ))}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => onSend(vars)}
          disabled={disabled}
          className="rounded-md bg-gradient-to-r from-cyan-500 to-emerald-400 px-3 py-1.5 text-xs font-semibold text-[#06223e] disabled:opacity-50"
        >
          Enviar template
        </button>
      </div>
    </div>
  );
}

export function InboxComposer({
  conversationId,
  windowExpired,
  cannedResponses,
  approvedTemplates,
  audioEnabled = false,
  contactName,
  municipio,
}: {
  conversationId: number;
  windowExpired: boolean;
  cannedResponses: Canned[];
  approvedTemplates: ApprovedTemplate[];
  audioEnabled?: boolean;
  contactName?: string | null;
  municipio?: string | null;
}) {
  const [body, setBody] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Template selecionado p/ o mini-form de variáveis (null = lista).
  const [tplPicked, setTplPicked] = useState<ApprovedTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popoversRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Contador de dragenter/leave: drags sobre filhos disparam leave do pai senão.
  const dragDepth = useRef(0);

  // Envia um arquivo (paperclip ou drag-drop). Fluxo CLIENT-DIRECT: faz upload
  // do File direto pro Vercel Blob via upload() do @vercel/blob/client (a rota
  // /api/marketing/blob-upload emite o token gated). Isso contorna o limite de
  // body da função serverless (~4.5MB) e o de 1MB do Server Action — PDF/PPT
  // grandes (até 50MB) passam. Depois chama sendMediaUrlReply só com a URL.
  function uploadAndSendFile(file: File) {
    if (isPending) return;
    if (!file || file.size === 0) {
      setError('Arquivo vazio.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Arquivo acima de 50MB.');
      return;
    }
    if (windowExpired) {
      setError('Janela de 24h expirada — fora dela só template.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/marketing/blob-upload',
          contentType: file.type,
        });
        const fd = new FormData();
        fd.set('conversationId', String(conversationId));
        fd.set('mediaUrl', blob.url);
        fd.set('contentType', file.type);
        fd.set('filename', file.name);
        const r = await sendMediaUrlReply(fd);
        if (r && !r.ok) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar arquivo.');
      }
    });
  }

  // Encerra qualquer gravação em andamento ao desmontar.
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') {
        try { r.stop(); } catch { /* noop */ }
      }
      r?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function uploadAndSend(blob: Blob, mime: string) {
    if (blob.size === 0) {
      setError('Gravação vazia.');
      return;
    }
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : 'bin';
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('audio', new File([blob], `voice.${ext}`, { type: mime || blob.type }));
    startTransition(async () => {
      try {
        const r = await sendAudioReply(fd);
        if (r && !r.ok) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar áudio.');
      }
    });
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Gravação de áudio não suportada neste navegador.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const usedMime = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: usedMime });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        recorderRef.current = null;
        uploadAndSend(blob, usedMime);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      // Permissão negada (NotAllowedError / 'not-allowed') → instrução clara
      // de como reabilitar o microfone na barra de endereço.
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(
          'Microfone bloqueado — permita no cadeado 🔒 da barra de endereço e recarregue.',
        );
      } else {
        setError('Não foi possível acessar o microfone (permissão negada?).');
      }
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }

  function cancelRecording() {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      r.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop());
      };
      r.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }

  function closePopovers() {
    setEmojiOpen(false);
    setCannedOpen(false);
    setTemplatesOpen(false);
    setTplPicked(null);
  }

  // Fecha emoji / respostas rápidas / templates ao clicar fora ou apertar Escape.
  useEffect(() => {
    if (!emojiOpen && !cannedOpen && !templatesOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (popoversRef.current && !popoversRef.current.contains(e.target as Node)) {
        closePopovers();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePopovers();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiOpen, cannedOpen, templatesOpen]);

  // Variáveis padrão auto-preenchidas a partir do contato (template
  // i10_primeiro_contato: {{1}}=nome, {{2}}=município). Editáveis no mini-form.
  const defaultVars = [
    contactName?.trim() || 'Secretário(a)',
    municipio?.trim() || 'seu município',
  ];

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
        const r = await sendConversationReply(fd);
        if (r && !r.ok) {
          setError(r.error);
          return;
        }
        setBody('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar.');
      }
    });
  }

  function submitTemplate(contentSid: string, vars: string[] = []) {
    if (isPending) return;
    setError(null);
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('contentSid', contentSid);
    vars.forEach((v, i) => fd.set(`var_${i + 1}`, v));
    startTransition(async () => {
      try {
        const r = await sendTemplateReply(fd);
        if (r && !r.ok) {
          setError(r.error);
          return;
        }
        closePopovers();
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
            {tplPicked ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <TemplateVarForm
                  template={tplPicked}
                  defaults={defaultVars}
                  disabled={isPending}
                  onSend={(vars) => submitTemplate(tplPicked.contentSid, vars)}
                  onCancel={() => setTplPicked(null)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {approvedTemplates.map((t) => (
                  <button
                    key={t.contentSid}
                    type="button"
                    disabled={isPending}
                    onClick={() => setTplPicked(t)}
                    className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="text-xs text-cyan-700">Selecionar</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Dentro da janela: freeform + emoji + respostas rápidas ──
  return (
    <div
      className="relative border-t border-slate-200 bg-white p-3"
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        // Necessário p/ habilitar o drop e evitar o browser abrir o arquivo (bug).
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) uploadAndSendFile(file);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-50/90 text-sm font-semibold text-cyan-800">
          Solte o arquivo para enviar
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadAndSendFile(file);
          e.target.value = ''; // permite reenviar o mesmo arquivo
        }}
      />
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

          {/* Templates Meta (válidos dentro e fora da janela) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setTemplatesOpen((v) => !v);
                setTplPicked(null);
                setEmojiOpen(false);
                setCannedOpen(false);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Templates
            </button>
            {templatesOpen && (
              <div className="absolute bottom-full left-0 z-10 mb-1 max-h-80 w-72 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                {approvedTemplates.length === 0 ? (
                  <div className="p-2 text-xs text-slate-500">
                    Nenhum template aprovado disponível.
                  </div>
                ) : tplPicked ? (
                  <TemplateVarForm
                    template={tplPicked}
                    defaults={defaultVars}
                    disabled={isPending}
                    onSend={(vars) => submitTemplate(tplPicked.contentSid, vars)}
                    onCancel={() => setTplPicked(null)}
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    {approvedTemplates.map((t) => (
                      <button
                        key={t.contentSid}
                        type="button"
                        onClick={() => setTplPicked(t)}
                        className="flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-800">{t.name}</span>
                        <span className="text-xs text-cyan-700">Selecionar</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Anexar arquivo (paperclip → input file oculto) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Nota de voz (MediaRecorder) */}
          {recording ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                gravando…
              </span>
              <button
                type="button"
                onClick={stopRecording}
                disabled={isPending}
                className="rounded-md bg-rose-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                title="Parar e enviar"
              >
                Enviar áudio
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                title="Cancelar"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={!audioEnabled || isPending}
              title={audioEnabled ? 'Gravar nota de voz' : 'configurar storage'}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Gravar nota de voz"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
          )}
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
