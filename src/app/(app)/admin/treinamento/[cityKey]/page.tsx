import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TreinamentoPlayer } from '@/components/treinamento-player';

export const dynamic = 'force-dynamic';

const CITY_LABELS: Record<string, { label: string; size: 'pequeno' | 'medio' | 'grande' | 'e2e' }> = {
  'pequeno-balbinos': { label: 'Balbinos (pequena)', size: 'pequeno' },
  'medio-paulinia': { label: 'Paulínia (média)', size: 'medio' },
  'grande-campinas': { label: 'Campinas (grande)', size: 'grande' },
  'e2e-paulinia': { label: 'Fluxo completo APM → CRM → BNCC (Paulínia)', size: 'e2e' },
};

interface SceneData {
  sceneId: string;
  url: string;
  stepLabel: string;
  secretQuestion: string;
  consultorResponse: string;
  screenshotPre: string;
  screenshotPost: string;
}

interface TranscriptData {
  muni: {
    id: number;
    nome: string;
    totalMatriculas: number | null;
    receitaTotal: number | null;
    potTotal: number | null;
    recebeVaar?: boolean;
    vaarBanco?: number | null;
    idebAi?: number | null;
  };
  scenes: SceneData[];
  errors: Array<{ scene: string; error: string }>;
  durationSec: number;
}

async function loadTranscript(cityKey: string): Promise<TranscriptData | null> {
  try {
    const path = resolve(process.cwd(), 'public', 'treinamento', 'data', `${cityKey}.json`);
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as TranscriptData;
  } catch {
    return null;
  }
}

export default async function TreinamentoCidade({ params }: { params: Promise<{ cityKey: string }> }) {
  const { cityKey } = await params;
  const meta = CITY_LABELS[cityKey];
  if (!meta) notFound();

  const transcript = await loadTranscript(cityKey);

  if (!transcript) {
    return (
      <div className="px-8 py-8 max-w-3xl">
        <header className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-i10-700 mb-1">
            Admin · Treinamento
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{meta.label}</h1>
        </header>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mt-4">
          <p className="text-amber-800 text-sm">
            O conteúdo deste treinamento ainda está sendo gerado. Tente novamente em alguns minutos.
          </p>
          <Link href="/admin/treinamento" className="text-i10-700 hover:underline text-sm mt-3 inline-block">
            ← Voltar para a lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-8 pt-6 pb-2 border-b border-slate-200 bg-slate-50">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-i10-700 mb-1">
          Admin · Treinamento
        </p>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{meta.label}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {(transcript.muni.totalMatriculas ?? 0).toLocaleString('pt-BR')} matrículas ·{' '}
              {transcript.scenes.length} cenas · duração{' '}
              {Math.floor(transcript.durationSec / 60)}:{String(Math.floor(transcript.durationSec % 60)).padStart(2, '0')}
            </p>
          </div>
          <Link
            href="/admin/treinamento"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-i10-700 hover:text-i10-700 transition-colors"
          >
            ← Voltar
          </Link>
        </div>
      </div>

      <TreinamentoPlayer cityKey={cityKey} transcript={transcript} />
    </div>
  );
}
