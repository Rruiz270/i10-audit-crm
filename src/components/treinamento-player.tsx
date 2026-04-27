"use client";

import { useState } from "react";

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
}

const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toLocaleString("pt-BR")}`;
};

export function TreinamentoPlayer({ cityKey, transcript }: { cityKey: string; transcript: TranscriptData }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const scene = transcript.scenes[sceneIdx];
  const total = transcript.scenes.length;

  function go(delta: number) {
    setSceneIdx((cur) => Math.max(0, Math.min(total - 1, cur + delta)));
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-6">
      {/* Meta header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <MetaCard label="Município" value={transcript.muni.nome} />
        <MetaCard label="Matrículas" value={(transcript.muni.totalMatriculas ?? 0).toLocaleString("pt-BR")} />
        <MetaCard label="Receita atual" value={fmt(transcript.muni.receitaTotal)} />
        <MetaCard label="Potencial" value={fmt(transcript.muni.potTotal)} accent="emerald" />
        {transcript.muni.recebeVaar !== undefined && (
          <MetaCard
            label="VAAR"
            value={transcript.muni.recebeVaar ? "Recebe" : "Não recebe"}
            accent={transcript.muni.recebeVaar ? "emerald" : "amber"}
          />
        )}
      </div>

      {/* Vídeo */}
      <div className="bg-black rounded-xl overflow-hidden mb-6">
        <video
          src={`/treinamento/videos/${cityKey}.webm`}
          controls
          preload="metadata"
          className="w-full aspect-video block"
        />
      </div>

      {/* Navegação por cena */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-[var(--text2)]">
          <span className="font-bold text-[var(--navy)]">{scene?.stepLabel}</span>
          <span className="ml-2 text-[var(--text3)]">·</span>
          <code className="ml-2 text-[var(--text3)] text-xs">{scene?.url}</code>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            disabled={sceneIdx === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg)] text-[var(--text2)] hover:bg-[var(--border)] transition-colors disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs font-semibold tabular-nums text-[var(--text2)] min-w-[60px] text-center">
            {sceneIdx + 1} / {total}
          </span>
          <button
            onClick={() => go(1)}
            disabled={sceneIdx === total - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00B4D8] text-white hover:bg-[#009fc0] transition-colors disabled:opacity-40"
          >
            Próximo →
          </button>
        </div>
      </div>

      {/* Cena: screenshot + diálogo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          {scene?.screenshotPost ? (
            <img
              src={`/treinamento/data/${cityKey}/${scene.screenshotPost}`}
              alt={scene.sceneId}
              className="w-full block"
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-[var(--text3)] text-sm">
              Screenshot não disponível
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border-l-4 border-[#00B4D8] rounded-lg p-5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#00B4D8] mb-2">
              SECRETÁRIA DE EDUCAÇÃO
            </div>
            <p className="text-sm text-[var(--text1)] leading-relaxed">{scene?.secretQuestion}</p>
          </div>

          <div className="bg-[#0A2463] border-l-4 border-[#00E5A0] rounded-lg p-5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#00E5A0] mb-2">
              CONSULTOR i10
            </div>
            <p className="text-sm text-white leading-relaxed">{scene?.consultorResponse}</p>
          </div>

          <div className="bg-[var(--bg)] rounded-lg p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text3)] mb-2">
              Sobre esta cena
            </div>
            <p className="text-xs text-[var(--text2)] leading-relaxed">
              Esta cena ilustra o momento em que o consultor explica <strong>{scene?.sceneId.replace(/-/g, " ")}</strong>.
              Use as setas do teclado <kbd className="px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[10px]">←</kbd>
              {" e "}
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[10px]">→</kbd>
              {" "}para navegar entre cenas.
            </p>
          </div>
        </div>
      </div>

      {transcript.errors.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-700 mb-2">
            {transcript.errors.length} erro(s) durante a gravação (não bloqueantes)
          </h3>
          <ul className="text-xs text-amber-800 space-y-1">
            {transcript.errors.map((e, i) => (
              <li key={i}>
                <code className="bg-white px-1.5 py-0.5 rounded">{e.scene}</code>: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Keyboard handler */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        ref={(el) => {
          if (el) {
            el.focus();
            el.onkeydown = (e: KeyboardEvent) => {
              if (e.key === "ArrowLeft") go(-1);
              if (e.key === "ArrowRight") go(1);
            };
          }
        }}
        style={{ outline: "none" }}
      />
    </div>
  );
}

function MetaCard({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "amber" }) {
  const valueColor =
    accent === "emerald" ? "text-emerald-600" : accent === "amber" ? "text-amber-600" : "text-[var(--text1)]";
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text3)] mb-1">
        {label}
      </div>
      <div className={`text-sm font-bold ${valueColor} truncate`} title={value}>
        {value}
      </div>
    </div>
  );
}
