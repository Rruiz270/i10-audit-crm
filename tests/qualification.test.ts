import { describe, expect, it } from 'vitest';
import { canAdvance, type OpportunitySnapshot } from '@/lib/qualification';
import { STAGES } from '@/lib/pipeline';

function snapshot(overrides: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
  return {
    stage: 'novo',
    municipalityId: null,
    estimatedValue: null,
    closeDate: null,
    primaryContactId: null,
    ...overrides,
  };
}

describe('canAdvance — guards de saída de estágio', () => {
  it('bloqueia sair de "novo" sem município e sem contato principal', () => {
    const result = canAdvance(snapshot(), 'contato_inicial');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Município vinculado');
      expect(result.missing).toContain('Contato principal (Prefeito/Secretário)');
    }
  });

  it('libera sair de "novo" com município e contato preenchidos', () => {
    const result = canAdvance(
      snapshot({ municipalityId: 42, primaryContactId: 7 }),
      'contato_inicial',
    );
    expect(result.ok).toBe(true);
  });

  it('bloqueia sair de "negociacao" sem valor estimado e data de fechamento', () => {
    const result = canAdvance(snapshot({ stage: 'negociacao' }), 'ganhou');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('Valor estimado');
      expect(result.missing).toContain('Data prevista de fechamento');
    }
  });

  it('libera sair de "negociacao" com valor e data preenchidos', () => {
    const result = canAdvance(
      snapshot({ stage: 'negociacao', estimatedValue: 100_000, closeDate: new Date(2026, 0, 1) }),
      'ganhou',
    );
    expect(result.ok).toBe(true);
  });

  it('valor estimado 0 conta como preenchido (só null bloqueia)', () => {
    const result = canAdvance(
      snapshot({ stage: 'negociacao', estimatedValue: 0, closeDate: new Date(2026, 0, 1) }),
      'ganhou',
    );
    expect(result.ok).toBe(true);
  });

  it('estágios sem requiredFieldsToExit sempre liberam', () => {
    for (const stage of STAGES.filter((s) => s.requiredFieldsToExit.length === 0)) {
      expect(canAdvance(snapshot({ stage: stage.key }), 'perdido').ok).toBe(true);
    }
  });
});
