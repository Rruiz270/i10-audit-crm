'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWhatsAppTemplate } from '@/lib/actions/marketing/whatsapp-templates';

// ─── Template Builder (cliente) — formulário estilo Meta + preview ao vivo ──
// Server component renderiza a página + lista; este componente cuida do form
// interativo e do preview da bolha WhatsApp. Submete via createWhatsAppTemplate.

const CATEGORIES = [
  {
    value: 'UTILITY',
    label: 'Utilidade',
    hint: 'Confirmações, lembretes, atualizações. Texto puro aprova em segundos.',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    hint: 'Promoções, convites, botões. Revisão da Meta costuma demorar mais.',
  },
  {
    value: 'AUTHENTICATION',
    label: 'Autenticação',
    hint: 'Códigos de verificação (OTP).',
  },
] as const;

const LANGUAGES = [
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'en_US', label: 'Inglês (EUA)' },
  { value: 'es', label: 'Espanhol' },
];

function extractPlaceholders(body: string): number[] {
  const found = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

export function TemplateBuilder() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [category, setCategory] = useState<string>('UTILITY');
  const [body, setBody] = useState('');
  const [samples, setSamples] = useState<Record<number, string>>({});
  const [buttons, setButtons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);

  const previewBody = useMemo(() => {
    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (mm, n: string) => {
      const s = samples[Number(n)];
      return s && s.trim() ? s : mm;
    });
  }, [body, samples]);

  function addPlaceholder() {
    const next = (placeholders.length ? Math.max(...placeholders) : 0) + 1;
    setBody((b) => `${b}{{${next}}}`);
  }

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((b) => [...b, '']);
  }

  function submit() {
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set('name', name);
    fd.set('language', language);
    fd.set('category', category);
    fd.set('body', body);
    for (const n of placeholders) fd.set(`sample_${n}`, samples[n] ?? '');
    buttons.forEach((title, i) => {
      if (title.trim()) fd.set(`button_${i + 1}`, title.trim());
    });
    startTransition(async () => {
      const r = await createWhatsAppTemplate(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(`Template criado e submetido à Meta (${r.sid}). Status: pendente de aprovação.`);
      setName('');
      setBody('');
      setSamples({});
      setButtons([]);
      router.refresh();
    });
  }

  const activeCat = CATEGORIES.find((c) => c.value === category);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* ── Form ── */}
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Nome do template</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="i10_primeiro_contato"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[11px] text-slate-400">a-z, 0-9 e _ (snake_case)</span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Idioma</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-600">Categoria</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition ' +
                  (category === c.value
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          {activeCat && <p className="mt-1.5 text-[11px] text-slate-500">{activeCat.hint}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Corpo da mensagem</span>
            <button
              type="button"
              onClick={addPlaceholder}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              + variável {`{{${(placeholders.length ? Math.max(...placeholders) : 0) + 1}}}`}
            </button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Olá {{1}}, somos do Instituto i10 e gostaríamos de falar sobre o município de {{2}}…"
            className="mt-1 h-32 w-full resize-none rounded-md border border-slate-300 p-3 text-sm"
          />
        </div>

        {placeholders.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-slate-600">
              Exemplos das variáveis (exigido pela Meta)
            </span>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {placeholders.map((n) => (
                <label key={n} className="block">
                  <span className="text-[11px] text-slate-500">{`{{${n}}}`}</span>
                  <input
                    value={samples[n] ?? ''}
                    onChange={(e) => setSamples((s) => ({ ...s, [n]: e.target.value }))}
                    placeholder={n === 1 ? 'Secretário(a)' : 'exemplo'}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Botões de resposta rápida (até 3)</span>
            <button
              type="button"
              onClick={addButton}
              disabled={buttons.length >= 3}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              + botão
            </button>
          </div>
          <div className="mt-1 space-y-2">
            {buttons.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={title}
                  onChange={(e) =>
                    setButtons((b) => b.map((t, j) => (j === i ? e.target.value : t)))
                  }
                  placeholder={`Título do botão ${i + 1}`}
                  maxLength={25}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setButtons((b) => b.filter((_, j) => j !== i))}
                  className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  Remover
                </button>
              </div>
            ))}
            {buttons.length === 0 && (
              <p className="text-[11px] text-slate-400">
                Sem botões = template de texto puro (aprova mais rápido).
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={isPending || !name || !body}
          className="rounded-md bg-gradient-to-r from-cyan-500 to-emerald-400 px-5 py-2.5 text-sm font-semibold text-[#06223e] disabled:opacity-50"
        >
          {isPending ? 'Enviando à Meta…' : 'Criar e submeter à Meta'}
        </button>
      </div>

      {/* ── Preview ── */}
      <div>
        <span className="text-xs font-semibold text-slate-600">Pré-visualização</span>
        <div
          className="mt-1 rounded-2xl border border-slate-200 p-4"
          style={{ background: '#E5DDD5' }}
        >
          <div className="ml-auto max-w-[300px] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-3 py-2 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug text-slate-800">
              {previewBody || (
                <span className="text-slate-400">A mensagem aparece aqui…</span>
              )}
            </p>
            <div className="mt-1 text-right text-[10px] text-slate-500">12:00 ✓✓</div>
          </div>
          {buttons.filter((b) => b.trim()).length > 0 && (
            <div className="mt-1.5 ml-auto max-w-[300px] space-y-1">
              {buttons
                .filter((b) => b.trim())
                .map((b, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-white px-3 py-2 text-center text-[13px] font-medium text-[#00A5F4] shadow-sm"
                  >
                    {b}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
