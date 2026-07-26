import { describe, expect, it } from 'vitest';
import { computeProspectScore, type ProspectMetrics } from '@/lib/prospecting';

function metrics(overrides: Partial<ProspectMetrics> = {}): ProspectMetrics {
  return {
    matriculas: null,
    receitaFundeb: null,
    complementacaoVaat: null,
    complementacaoVaar: null,
    ...overrides,
  };
}

describe('computeProspectScore — ranking de potencial FUNDEB', () => {
  it('sem dado nenhum: score 0 e valor estimado null', () => {
    const r = computeProspectScore(metrics());
    expect(r.score).toBe(0);
    expect(r.valorEstimado).toBeNull();
  });

  it('score fica sempre entre 0 e 100', () => {
    const r = computeProspectScore(
      metrics({
        matriculas: 1_000_000,
        receitaFundeb: 5_000_000_000,
        complementacaoVaat: 5_000_000_000,
        complementacaoVaar: 100_000_000,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('município que recebe VAAT pontua mais que um idêntico sem VAAT', () => {
    const base = metrics({ matriculas: 5_000, receitaFundeb: 30_000_000 });
    const semVaat = computeProspectScore(base);
    const comVaat = computeProspectScore({ ...base, complementacaoVaat: 6_000_000 });
    expect(comVaat.score).toBeGreaterThan(semVaat.score);
    expect(comVaat.breakdown.vaat).toBeGreaterThan(0);
  });

  it('rede maior pontua mais no componente porte', () => {
    const pequeno = computeProspectScore(metrics({ matriculas: 800 }));
    const grande = computeProspectScore(metrics({ matriculas: 40_000 }));
    expect(grande.breakdown.porte).toBeGreaterThan(pequeno.breakdown.porte);
  });

  it('valor estimado = 2% da receita + 10% do VAAT', () => {
    const r = computeProspectScore(
      metrics({ receitaFundeb: 10_000_000, complementacaoVaat: 2_000_000 }),
    );
    expect(r.valorEstimado).toBe(10_000_000 * 0.02 + 2_000_000 * 0.1);
  });

  it('sem receita conhecida usa piso por matrícula (R$ 120)', () => {
    const r = computeProspectScore(metrics({ matriculas: 1_500 }));
    expect(r.valorEstimado).toBe(1_500 * 120);
  });

  it('IDEB baixo pontua mais que IDEB alto (risco de perder VAAR)', () => {
    const base = metrics({ matriculas: 5_000, receitaFundeb: 30_000_000 });
    const idebBaixo = computeProspectScore({ ...base, ideb: 3.2 });
    const idebAlto = computeProspectScore({ ...base, ideb: 6.8 });
    expect(idebBaixo.breakdown.ideb).toBe(10);
    expect(idebAlto.breakdown.ideb).toBe(0);
    expect(idebBaixo.score).toBeGreaterThan(idebAlto.score);
  });

  it('sem IDEB o componente é 0 e o score não muda', () => {
    const base = metrics({ matriculas: 5_000, receitaFundeb: 30_000_000 });
    const semIdeb = computeProspectScore(base);
    expect(semIdeb.breakdown.ideb).toBe(0);
    expect(computeProspectScore({ ...base, ideb: null }).score).toBe(semIdeb.score);
  });

  it('VAAR presente soma exatamente 10 pontos', () => {
    const sem = computeProspectScore(metrics({ matriculas: 5_000 }));
    const com = computeProspectScore(
      metrics({ matriculas: 5_000, complementacaoVaar: 500_000 }),
    );
    expect(com.score - sem.score).toBe(10);
  });
});
