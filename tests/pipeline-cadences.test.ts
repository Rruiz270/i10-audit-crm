import { describe, expect, it } from 'vitest';
import {
  nextBestAction,
  shouldTriggerCadence,
} from '@/lib/marketing/pipeline-cadences';

// Regras do gatilho da cadência automática (deal parado → sequência + tarefa).
// rotDays por estágio vem de src/lib/pipeline.ts: novo=5, follow_up=14,
// negociacao=7; terminais (ganhou/perdido) nunca apodrecem.

const NOW = new Date('2026-07-26T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('shouldTriggerCadence', () => {
  it('dispara quando o deal passou do rotDays e nunca disparou antes', () => {
    const op = { stage: 'novo', lastActivityAt: daysAgo(6) }; // rotDays = 5
    expect(shouldTriggerCadence(op, null, NOW)).toBe(true);
  });

  it('não dispara quando o deal ainda está dentro do rotDays', () => {
    const op = { stage: 'follow_up', lastActivityAt: daysAgo(3) }; // rotDays = 14
    expect(shouldTriggerCadence(op, null, NOW)).toBe(false);
  });

  it('não dispara em estágio terminal, mesmo sem atividade', () => {
    const op = { stage: 'ganhou', lastActivityAt: null };
    expect(shouldTriggerCadence(op, null, NOW)).toBe(false);
  });

  it('dispara quando nunca houve atividade (lastActivityAt null) em estágio ativo', () => {
    const op = { stage: 'negociacao', lastActivityAt: null };
    expect(shouldTriggerCadence(op, null, NOW)).toBe(true);
  });

  it('NÃO re-dispara enquanto não houver atividade real após o último disparo', () => {
    const op = { stage: 'novo', lastActivityAt: daysAgo(10) };
    const lastCadence = daysAgo(4); // marcador mais novo que a última atividade
    expect(shouldTriggerCadence(op, lastCadence, NOW)).toBe(false);
  });

  it('re-arma depois de atividade real mais nova que o último disparo', () => {
    const op = { stage: 'novo', lastActivityAt: daysAgo(6) }; // rotten de novo
    const lastCadence = daysAgo(20); // vendedor agiu depois do disparo antigo
    expect(shouldTriggerCadence(op, lastCadence, NOW)).toBe(true);
  });

  it('não re-dispara deal sem nenhuma atividade que já recebeu cadência', () => {
    const op = { stage: 'novo', lastActivityAt: null };
    expect(shouldTriggerCadence(op, daysAgo(2), NOW)).toBe(false);
  });
});

describe('nextBestAction', () => {
  it('sugere ação específica por estágio', () => {
    expect(nextBestAction('diagnostico_enviado')).toMatch(/diagnóstico/i);
    expect(nextBestAction('negociacao')).toMatch(/negociação/i);
  });

  it('tem fallback para estágio desconhecido', () => {
    expect(nextBestAction('estagio_custom')).toMatch(/retomar/i);
  });
});
