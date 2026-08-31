import { asc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { fundebMunicipalities, municipalityProspecting } from './schema';

// ─── Score de potencial FUNDEB ─────────────────────────────────────────────
// Heurística transparente sobre dados públicos (FNDE/SIOPE). Pontua 0–100:
//   · porte   (0–30): tamanho da rede municipal (matrículas, escala log)
//   · vaat    (0–35): dependência da complementação VAAT — municípios que
//                     recebem VAAT têm mais distorção declaratória a auditar
//   · vaar    (0–10): recebe VAAR (condicionalidades ativas → gestão engajada)
//   · receita (0–25): volume anual do FUNDEB (escala log)
// O valor estimado é o potencial anual de recuperação/incremento via auditoria:
// 2% da receita FUNDEB + 10% da complementação VAAT; sem receita conhecida,
// piso conservador de R$ 120/matrícula.

export type ProspectMetrics = {
  matriculas: number | null;
  receitaFundeb: number | null;
  complementacaoVaat: number | null;
  complementacaoVaar: number | null;
};

export type ProspectScore = {
  score: number; // 0–100 (inteiro)
  valorEstimado: number | null; // R$/ano — null quando não há dado nenhum
  breakdown: { porte: number; vaat: number; vaar: number; receita: number };
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// Escala log entre um piso e um teto — devolve fração 0..1.
function logScale(value: number, floor: number, ceil: number): number {
  if (value <= floor) return 0;
  return clamp01(Math.log10(value / floor) / Math.log10(ceil / floor));
}

export function computeProspectScore(m: ProspectMetrics): ProspectScore {
  const matriculas = m.matriculas ?? 0;
  const receita = m.receitaFundeb ?? 0;
  const vaat = m.complementacaoVaat ?? 0;
  const vaar = m.complementacaoVaar ?? 0;

  // Porte: 500 matrículas → 0 · 50.000 matrículas → 30.
  const porte = 30 * logScale(matriculas, 500, 50_000);

  // VAAT: proporcional ao peso da complementação na receita (até 40% dela).
  // Sem receita conhecida, a mera presença de VAAT vale metade da faixa.
  const vaatShare = receita > 0 ? clamp01(vaat / receita / 0.4) : vaat > 0 ? 0.5 : 0;
  const vaatPts = 35 * vaatShare;

  const vaarPts = vaar > 0 ? 10 : 0;

  // Receita: R$ 2 mi/ano → 0 · R$ 500 mi/ano → 25.
  const receitaPts = 25 * logScale(receita, 2_000_000, 500_000_000);

  const breakdown = {
    porte: Math.round(porte),
    vaat: Math.round(vaatPts),
    vaar: vaarPts,
    receita: Math.round(receitaPts),
  };
  const score = Math.min(
    100,
    breakdown.porte + breakdown.vaat + breakdown.vaar + breakdown.receita,
  );

  let valorEstimado: number | null = null;
  if (receita > 0) {
    valorEstimado = Math.round(receita * 0.02 + vaat * 0.1);
  } else if (matriculas > 0) {
    valorEstimado = matriculas * 120;
  }

  return { score, valorEstimado, breakdown };
}

// ─── Consultas ─────────────────────────────────────────────────────────────

export type RankedProspect = {
  municipalityId: number;
  nome: string;
  uf: string | null;
  regiao: string | null;
  anoReferencia: number | null;
  matriculas: number | null;
  receitaFundeb: number | null;
  complementacaoVaat: number | null;
  complementacaoVaar: number | null;
  openOpportunities: number;
  consultorias: number;
} & ProspectScore;

/** Municípios com dados importados, ranqueados por score (desc). */
export async function rankedProspects(): Promise<RankedProspect[]> {
  const rows = await db
    .select({
      municipalityId: fundebMunicipalities.id,
      nome: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
      regiao: fundebMunicipalities.regiao,
      anoReferencia: municipalityProspecting.anoReferencia,
      matriculas: municipalityProspecting.matriculas,
      receitaFundeb: municipalityProspecting.receitaFundeb,
      complementacaoVaat: municipalityProspecting.complementacaoVaat,
      complementacaoVaar: municipalityProspecting.complementacaoVaar,
      // Oportunidade "aberta" = sem desfecho (ganho/perda) — independe dos
      // estágios customizáveis.
      openOpportunities: sql<number>`(
        SELECT count(*)::int FROM crm.opportunities o
        WHERE o.municipality_id = ${fundebMunicipalities.id}
          AND o.won_at IS NULL AND o.lost_at IS NULL
      )`,
      consultorias: sql<number>`(
        SELECT count(*)::int FROM fundeb.consultorias c
        WHERE c.municipality_id = ${fundebMunicipalities.id}
      )`,
    })
    .from(municipalityProspecting)
    .innerJoin(
      fundebMunicipalities,
      eq(municipalityProspecting.municipalityId, fundebMunicipalities.id),
    )
    .orderBy(asc(fundebMunicipalities.uf), asc(fundebMunicipalities.nome));

  return rows
    .map((r) => ({
      ...r,
      openOpportunities: Number(r.openOpportunities ?? 0),
      consultorias: Number(r.consultorias ?? 0),
      ...computeProspectScore(r),
    }))
    .sort((a, b) => b.score - a.score || (b.valorEstimado ?? 0) - (a.valorEstimado ?? 0));
}

export type Diagnostico = {
  municipio: string;
  uf: string | null;
  anoReferencia: number | null;
  matriculas: number | null;
  receitaFundeb: number | null;
  recebeVaat: boolean;
  recebeVaar: boolean;
  score: number;
  valorEstimado: number | null;
};

/**
 * "Diagnóstico gratuito" para o intake público — só dados que já são públicos
 * (FNDE/SIOPE). Retorna null se o município não tem métricas importadas.
 */
export async function diagnosticoForMunicipality(
  municipalityId: number,
): Promise<Diagnostico | null> {
  const [row] = await db
    .select({
      nome: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
      anoReferencia: municipalityProspecting.anoReferencia,
      matriculas: municipalityProspecting.matriculas,
      receitaFundeb: municipalityProspecting.receitaFundeb,
      complementacaoVaat: municipalityProspecting.complementacaoVaat,
      complementacaoVaar: municipalityProspecting.complementacaoVaar,
    })
    .from(municipalityProspecting)
    .innerJoin(
      fundebMunicipalities,
      eq(municipalityProspecting.municipalityId, fundebMunicipalities.id),
    )
    .where(eq(municipalityProspecting.municipalityId, municipalityId))
    .limit(1);
  if (!row) return null;

  const { score, valorEstimado } = computeProspectScore(row);
  return {
    municipio: row.nome,
    uf: row.uf,
    anoReferencia: row.anoReferencia,
    matriculas: row.matriculas,
    receitaFundeb: row.receitaFundeb,
    recebeVaat: (row.complementacaoVaat ?? 0) > 0,
    recebeVaar: (row.complementacaoVaar ?? 0) > 0,
    score,
    valorEstimado,
  };
}
