'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createTask } from '@/lib/actions/tasks';
import { createActivity } from '@/lib/actions/activities';

/**
 * Assistente de voz minimalista (Web Speech API · pt-BR). Botão flutuante;
 * usuário pressiona, fala o comando, soltamos na ação correspondente.
 *
 * Comandos entendidos (prefixos alternativos são aceitos):
 *   · "abrir pipeline" / "ir pro funil" → navega /pipeline
 *   · "abrir tarefas" / "minhas tarefas" → navega /tasks
 *   · "abrir dashboard" → navega /
 *   · "nova oportunidade" → navega /opportunities/new
 *   · "nova tarefa <título>" → cria task na oportunidade atual (se aplicável)
 *   · "registrar nota <texto>" → cria activity na oportunidade atual
 *   · "cancelar" → fecha overlay
 *
 * Todas as interpretações são client-side. Se o reconhecimento errar, o usuário
 * vê o transcript e pode tentar de novo. Não é perfeito — é um atalho.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const [listening, setListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [result, setResult] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  // Mounted guard: no servidor e no 1º client render renderizamos null pra
  // evitar hydration mismatch (Web Speech API só existe no browser).
  const [mounted, setMounted] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const recogRef = React.useRef<SpeechRecognitionLike | null>(null);
  const handleCommandRef = React.useRef<(raw: string) => void>(() => {});

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted guard necessário contra hydration mismatch
    setMounted(true);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r = new Ctor();
    r.lang = 'pt-BR';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const t = last[0].transcript;
      setTranscript(t);
      if ((last as unknown as { isFinal: boolean }).isFinal) {
        handleCommandRef.current(t);
      }
    };
    r.onerror = (e) => setErr(`Erro no microfone: ${e.error}`);
    r.onend = () => setListening(false);
    recogRef.current = r;
    return () => {
      try {
        r.stop();
      } catch {}
    };
  }, []);

  const handleCommand = React.useCallback(async function handleCommand(raw: string) {
    const currentOpportunityId = (): number | null => {
      const m = pathname?.match(/^\/opportunities\/(\d+)/);
      return m ? Number(m[1]) : null;
    };

    const t = raw
      .toLowerCase()
      .trim()
      .replace(/[.,!?]/g, '');

    // Navigation
    const nav: Record<string, string> = {
      'abrir pipeline': '/pipeline',
      'ir pro funil': '/pipeline',
      'ir para pipeline': '/pipeline',
      'abrir tarefas': '/tasks',
      'minhas tarefas': '/tasks',
      'abrir dashboard': '/',
      abrir: '/',
      'abrir oportunidades': '/opportunities',
      'abrir relatórios': '/reports',
      'abrir leads': '/leads',
      'nova oportunidade': '/opportunities/new',
      'criar oportunidade': '/opportunities/new',
    };
    for (const [k, v] of Object.entries(nav)) {
      if (t === k || t.startsWith(k + ' ')) {
        setResult(`Abrindo ${v}`);
        router.push(v);
        return;
      }
    }

    if (t === 'cancelar' || t === 'fechar') {
      setResult(null);
      return;
    }

    // Nova tarefa
    const taskMatch = t.match(/^(?:nova tarefa|criar tarefa|tarefa) (.+)$/);
    if (taskMatch) {
      const title = taskMatch[1].trim();
      const opId = currentOpportunityId();
      if (!opId) {
        setResult('Preciso estar em uma oportunidade pra criar tarefa. Abra uma e tente de novo.');
        return;
      }
      const fd = new FormData();
      fd.set('opportunityId', String(opId));
      fd.set('title', title);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      fd.set('dueAt', tomorrow.toISOString().slice(0, 16));
      fd.set('priority', 'normal');
      const res = await createTask(fd);
      setResult(res?.ok ? `✓ Tarefa "${title}" criada (vence amanhã 9h)` : `Erro: ${res?.error}`);
      if (res?.ok) router.refresh();
      return;
    }

    // Registrar nota
    const noteMatch = t.match(/^(?:registrar nota|nota|anotar) (.+)$/);
    if (noteMatch) {
      const body = noteMatch[1].trim();
      const opId = currentOpportunityId();
      if (!opId) {
        setResult('Preciso estar em uma oportunidade pra registrar nota.');
        return;
      }
      const fd = new FormData();
      fd.set('opportunityId', String(opId));
      fd.set('type', 'note');
      fd.set('subject', 'Nota por voz');
      fd.set('body', body);
      const res = await createActivity(fd);
      setResult(res?.ok ? `✓ Nota registrada: "${body.slice(0, 40)}…"` : `Erro: ${res?.error}`);
      if (res?.ok) router.refresh();
      return;
    }

    setResult(`Não entendi: "${raw}". Tente: "abrir pipeline", "nova tarefa ligar amanhã", "registrar nota..."`);
  }, [pathname, router]);

  // Sincroniza ref sempre que handleCommand muda (closure sobre pathname).
  React.useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  function toggle() {
    const r = recogRef.current;
    if (!r) return;
    if (listening) {
      try { r.stop(); } catch {}
      setListening(false);
    } else {
      setErr(null);
      setTranscript('');
      setResult(null);
      try { r.start(); } catch (e) {
        setErr(String(e));
      }
      setListening(true);
    }
  }

  if (!mounted || !supported) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {(listening || result || err) && (
        <div className="rounded-lg shadow-lg bg-white border border-slate-200 p-3 max-w-sm text-xs">
          {listening && <div className="font-semibold text-slate-900 mb-1">🎙️ Escutando…</div>}
          {transcript && <div className="text-slate-700 italic">&ldquo;{transcript}&rdquo;</div>}
          {result && <div className="text-slate-900 mt-1">{result}</div>}
          {err && <div className="text-rose-700 mt-1">{err}</div>}
        </div>
      )}
      <button
        onClick={toggle}
        aria-label={listening ? 'Parar de escutar' : 'Comando de voz'}
        className={`rounded-full w-14 h-14 shadow-lg flex items-center justify-center text-xl transition-colors ${
          listening ? 'animate-pulse' : ''
        }`}
        style={{
          background: listening ? '#EF4444' : 'var(--i10-gradient-main)',
          color: '#FFFFFF',
        }}
      >
        {listening ? '⏹' : '🎤'}
      </button>
    </div>
  );
}
