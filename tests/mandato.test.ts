import { describe, expect, it } from 'vitest';
import { currentBuyingWindow, upcomingMilestones } from '@/lib/mandato';

describe('currentBuyingWindow — fase do mandato 2025–2028', () => {
  it('antes da posse: pré-mandato', () => {
    const w = currentBuyingWindow(new Date('2024-11-15T12:00:00-03:00'));
    expect(w.phase).toBe('pre_mandato');
    expect(w.mandateYear).toBeNull();
  });

  it('anos 1 e 2: janela quente (lua de mel)', () => {
    expect(currentBuyingWindow(new Date('2025-03-01T12:00:00-03:00')).phase).toBe('lua_de_mel');
    const y2 = currentBuyingWindow(new Date('2026-07-26T12:00:00-03:00'));
    expect(y2.phase).toBe('lua_de_mel');
    expect(y2.mandateYear).toBe(2);
  });

  it('ano 3: execução', () => {
    const w = currentBuyingWindow(new Date('2027-06-01T12:00:00-03:00'));
    expect(w.phase).toBe('execucao');
    expect(w.mandateYear).toBe(3);
  });

  it('ano 4 antes de maio: ano eleitoral; após LRF art. 42 continua eleitoral; após julho: vedação', () => {
    expect(currentBuyingWindow(new Date('2028-02-01T12:00:00-03:00')).phase).toBe('ano_eleitoral');
    expect(currentBuyingWindow(new Date('2028-06-01T12:00:00-03:00')).phase).toBe('ano_eleitoral');
    expect(currentBuyingWindow(new Date('2028-08-01T12:00:00-03:00')).phase).toBe('vedacao');
  });

  it('depois do mandato: transição', () => {
    expect(currentBuyingWindow(new Date('2029-01-05T12:00:00-03:00')).phase).toBe('transicao');
  });
});

describe('upcomingMilestones — calendário de janelas de compra', () => {
  it('retorna só marcos futuros, ordenados por data', () => {
    const now = new Date('2026-07-26T12:00:00-03:00');
    const ms = upcomingMilestones(now);
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) expect(m.date.getTime()).toBeGreaterThan(now.getTime());
    const times = ms.map((m) => m.date.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('em jul/2026 inclui a LOA 2027 e as prestações de contas de 2027', () => {
    const ms = upcomingMilestones(new Date('2026-07-26T12:00:00-03:00'));
    const keys = ms.map((m) => m.key);
    expect(keys).toContain('ploa_2026');
    expect(keys).toContain('parecer_cacs_2027');
    expect(keys).toContain('siope_2027');
  });

  it('no início de 2028 os marcos eleitorais entram no horizonte', () => {
    const ms = upcomingMilestones(new Date('2028-01-10T12:00:00-03:00'));
    const keys = ms.map((m) => m.key);
    expect(keys).toContain('lrf_art42');
    expect(keys).toContain('vedacao_eleitoral');
    expect(keys).toContain('eleicoes_2028');
  });

  it('daysUntil é positivo e coerente', () => {
    const now = new Date('2028-09-01T00:00:00-03:00');
    const ms = upcomingMilestones(now);
    const eleicao = ms.find((m) => m.key === 'eleicoes_2028');
    expect(eleicao).toBeDefined();
    expect(eleicao!.daysUntil).toBe(30);
  });
});
