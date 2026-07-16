'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import {
  sendConversationReply,
  sendAudioReply,
  sendMediaUrlReply,
} from '@/lib/actions/marketing/conversations';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const FILE_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'video/mp4',
].join(',');

const EMOJIS = [
  '😀', '😁', '😉', '😊', '🙂', '😍', '👍', '👏',
  '🙏', '🤝', '💪', '✅', '❤️', '🔥', '🎉', '⭐',
  '📅', '📌', '📞', '📈', '💡', '⚠️', '👋', '🚀',
];

function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const prefs = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

type Canned = { id: number; title: string; body: string };

export function AtendeComposer({
  conversationId,
  cannedResponses,
  audioEnabled,
}: {
  conversationId: number;
  cannedResponses: Canned[];
  audioEnabled: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'emoji' | 'canned'>(null);
  const [recording, setRecording] = useState(false);
  const [isPending, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') { try { r.stop(); } catch { /* noop */ } }
      r?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { setBody((b) => b + text); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => { ta.focus(); const p = start + text.length; ta.setSelectionRange(p, p); });
  }

  function submitText() {
    if (!body.trim() || isPending) return;
    setError(null);
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('body', body);
    startTransition(async () => {
      try {
        const r = await sendConversationReply(fd);
        if (r && !r.ok) { setError(r.error); return; }
        setBody('');
        setPanel(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar.');
      }
    });
  }

  function uploadAndSendFile(file: File) {
    if (isPending || !file || file.size === 0) return;
    if (file.size > MAX_FILE_BYTES) { setError('Arquivo acima de 50MB.'); return; }
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
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar arquivo.');
      }
    });
  }

  function uploadAndSendAudio(blob: Blob, mime: string) {
    if (blob.size === 0) { setError('Gravação vazia.'); return; }
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('webm') ? 'webm' : 'bin';
    const fd = new FormData();
    fd.set('conversationId', String(conversationId));
    fd.set('audio', new File([blob], `voice.${ext}`, { type: mime || blob.type }));
    startTransition(async () => {
      try {
        const r = await sendAudioReply(fd);
        if (r && !r.ok) setError(r.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao enviar áudio.');
      }
    });
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Gravação não suportada neste navegador.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const usedMime = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: usedMime });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        recorderRef.current = null;
        uploadAndSendAudio(blob, usedMime);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microfone bloqueado — permita no cadeado 🔒 da barra de endereço.'
        : 'Não foi possível acessar o microfone.');
    }
  }
  function stopRecording() { const r = recorderRef.current; if (r && r.state !== 'inactive') r.stop(); }
  function cancelRecording() {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') { r.onstop = () => r.stream.getTracks().forEach((t) => t.stop()); r.stop(); }
    recorderRef.current = null; chunksRef.current = []; setRecording(false);
  }

  return (
    <div className="atd-composer2">
      {error && <div className="atd-comp-err">{error}</div>}

      {panel === 'emoji' && (
        <div className="atd-emoji-grid">
          {EMOJIS.map((em) => (
            <button key={em} type="button" onClick={() => insertAtCursor(em)}>{em}</button>
          ))}
        </div>
      )}
      {panel === 'canned' && (
        <div className="atd-canned">
          {cannedResponses.length === 0 ? (
            <div className="atd-canned-empty">Nenhuma resposta rápida cadastrada.</div>
          ) : (
            cannedResponses.map((c) => (
              <button key={c.id} type="button" onClick={() => { insertAtCursor((body && !body.endsWith(' ') ? ' ' : '') + c.body); setPanel(null); }}>
                <b>{c.title}</b>
                <span>{c.body}</span>
              </button>
            ))
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept={FILE_ACCEPT} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSendFile(f); e.target.value = ''; }} />

      {recording ? (
        <div className="atd-rec">
          <span className="dot" /> gravando…
          <button className="ok" onClick={stopRecording} disabled={isPending}>Enviar áudio</button>
          <button className="cancel" onClick={cancelRecording}>Cancelar</button>
        </div>
      ) : (
        <div className="atd-comp-row">
          <button className="ic" type="button" aria-label="Emojis"
            onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')}>😊</button>
          <button className="ic" type="button" aria-label="Respostas rápidas"
            onClick={() => setPanel(panel === 'canned' ? null : 'canned')}>⚡</button>
          <textarea ref={taRef} rows={1} placeholder="Mensagem…" value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }} />
          <button className="ic" type="button" aria-label="Anexar" disabled={isPending}
            onClick={() => fileRef.current?.click()}>📎</button>
          {body.trim() ? (
            <button className="snd" type="button" aria-label="Enviar" disabled={isPending} onClick={submitText}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z" /></svg>
            </button>
          ) : (
            <button className="snd mic" type="button" aria-label="Gravar áudio"
              disabled={!audioEnabled || isPending} title={audioEnabled ? 'Gravar áudio' : 'Áudio indisponível'}
              onClick={startRecording}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
