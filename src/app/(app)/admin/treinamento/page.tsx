import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const dynamic = 'force-dynamic';

interface CityCard {
  cityKey: string;
  cityLabel: string;
  municipalityName: string;
  expectedSize: 'pequeno' | 'medio' | 'grande';
  durationSec?: number;
  scenesCount?: number;
  matriculas?: number | null;
  receitaTotal?: number | null;
  potTotal?: number | null;
}

const CITIES: CityCard[] = [
  { cityKey: 'pequeno-balbinos', cityLabel: 'Balbinos', municipalityName: 'Balbinos', expectedSize: 'pequeno' },
  { cityKey: 'medio-paulinia', cityLabel: 'Paulínia', municipalityName: 'Paulínia', expectedSize: 'medio' },
  { cityKey: 'grande-campinas', cityLabel: 'Campinas', municipalityName: 'Campinas', expectedSize: 'grande' },
];

const E2E = {
  cityKey: 'e2e-paulinia',
  label: 'Fluxo completo APM → CRM → BNCC',
  description: 'Simulação end-to-end: APM gera lead, CRM fecha contrato, BNCC executa auditoria FUNDEB.',
};

async function loadMeta(cityKey: string) {
  try {
    const path = resolve(process.cwd(), 'public', 'treinamento', 'data', `${cityKey}.json`);
    const raw = await readFile(path, 'utf-8');
    const data = JSON.parse(raw);
    return {
      durationSec: data.durationSec ?? 0,
      scenesCount: data.scenes?.length ?? 0,
      matriculas: data.muni?.totalMatriculas ?? null,
      receitaTotal: data.muni?.receitaTotal ?? null,
      potTotal: data.muni?.potTotal ?? null,
    };
  } catch {
    return null;
  }
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

const SIZE_BADGE = {
  pequeno: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'PEQUENO' },
  medio: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'MÉDIO' },
  grande: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'GRANDE' },
};

export default async function TreinamentoIndex() {
  const cards = await Promise.all(
    CITIES.map(async (c) => ({ ...c, ...(await loadMeta(c.cityKey)) })),
  );
  const e2eMeta = await loadMeta(E2E.cityKey);

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-i10-700 mb-1">
          Admin · Treinamento
        </p>
        <h1 className="text-2xl font-bold text-slate-900">
          Treinamento — i10 CRM
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          Vídeos de simulação cobrindo o fluxo de captação no CRM. Cada cidade
          tem tamanho diferente — escolha o caso mais próximo do que está conduzindo.
          O diálogo simula um <strong>Consultor Júnior</strong> aprendendo
          enquanto o <strong>Consultor Sênior i10</strong> demonstra cada tela.
        </p>
      </header>

      {e2eMeta && (
        <Link
          href={`/admin/treinamento/${E2E.cityKey}`}
          className="block mb-8 bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-xl p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start gap-5">
            <div className="text-5xl">▶</div>
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1">
                FLUXO COMPLETO · CROSS-APP
              </div>
              <div className="text-xl font-bold mb-1" style={{ fontFamily: "'Source Serif 4', serif" }}>
                {E2E.label}
              </div>
              <div className="text-sm text-white/80">{E2E.description}</div>
              <div className="mt-3 flex gap-4 text-xs text-white/60">
                <span>{e2eMeta.scenesCount ?? '—'} cenas</span>
                <span>·</span>
                <span>{e2eMeta.durationSec ? `${Math.floor(e2eMeta.durationSec / 60)} min` : '—'}</span>
                <span>·</span>
                <span>Paulínia (médio)</span>
              </div>
            </div>
          </div>
        </Link>
      )}

      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
        Treinamento por tela do CRM
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((card) => {
          const badge = SIZE_BADGE[card.expectedSize];
          return (
            <Link
              key={card.cityKey}
              href={`/admin/treinamento/${card.cityKey}`}
              className="block bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-i10-700 hover:shadow-md transition group"
            >
              <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center text-white relative">
                <div className="text-center px-4">
                  <div className={`inline-block ${badge.bg} ${badge.text} text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2`}>
                    {badge.label}
                  </div>
                  <div className="text-2xl font-extrabold" style={{ fontFamily: "'Source Serif 4', serif" }}>
                    {card.municipalityName}
                  </div>
                  <div className="text-xs text-white/60 mt-1">
                    {(card.matriculas ?? 0).toLocaleString('pt-BR')} matrículas
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-i10-700 flex items-center justify-center text-white text-xl group-hover:bg-emerald-500 transition-colors">
                  ▶
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 uppercase font-bold tracking-wider">Duração</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {card.durationSec ? `${Math.floor(card.durationSec / 60)}:${String(Math.floor(card.durationSec % 60)).padStart(2, '0')}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 uppercase font-bold tracking-wider">Cenas</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{card.scenesCount ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 uppercase font-bold tracking-wider">Receita atual</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{fmt(card.receitaTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 uppercase font-bold tracking-wider">Potencial</span>
                  <span className="font-semibold text-emerald-600 tabular-nums">{fmt(card.potTotal)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
        <h3 className="text-base font-bold text-slate-900 mb-2">Como usar o treinamento</h3>
        <ul className="text-sm text-slate-600 space-y-1.5 ml-4 list-disc">
          <li>
            Comece pelo <strong>fluxo completo</strong> (Paulínia) pra entender end-to-end como APM, CRM e BNCC se conectam.
          </li>
          <li>
            Depois aprofunde nas simulações por cidade — cada uma cobre o ciclo no CRM com dados reais do município.
          </li>
          <li>
            Use as setas <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[10px]">←</kbd> e <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[10px]">→</kbd> pra navegar entre cenas.
          </li>
          <li>
            Os vídeos também estão acessíveis pelo <strong>Admin Hub</strong> em <code>institutoi10.com.br/admin</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
