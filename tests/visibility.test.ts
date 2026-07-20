import { describe, expect, it } from 'vitest';
import { ADMIN_ROLES, isAdmin } from '@/lib/roles';
import { canSeeOpportunity, visibilityCondition } from '@/lib/visibility';

describe('isAdmin', () => {
  it('reconhece admin e gestor', () => {
    for (const role of ADMIN_ROLES) expect(isAdmin(role)).toBe(true);
  });

  it('nega consultor, string vazia, null e undefined', () => {
    expect(isAdmin('consultor')).toBe(false);
    expect(isAdmin('')).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('não aceita variações de caixa (roles são exatas no banco)', () => {
    expect(isAdmin('Admin')).toBe(false);
    expect(isAdmin('GESTOR')).toBe(false);
  });
});

describe('visibilityCondition', () => {
  it('admin/gestor veem tudo (sem cláusula WHERE)', () => {
    expect(visibilityCondition({ id: 'u1', role: 'admin' })).toBeUndefined();
    expect(visibilityCondition({ id: 'u1', role: 'gestor' })).toBeUndefined();
  });

  it('consultor recebe uma condição restritiva', () => {
    expect(visibilityCondition({ id: 'u1', role: 'consultor' })).toBeDefined();
  });
});

describe('canSeeOpportunity', () => {
  const consultor = { id: 'c1', role: 'consultor' };

  it('admin vê qualquer oportunidade, mesmo de outro dono', () => {
    expect(
      canSeeOpportunity({ id: 'a1', role: 'admin' }, { ownerId: 'outro', stage: 'negociacao' }),
    ).toBe(true);
  });

  it('consultor vê o próprio lead em qualquer estágio', () => {
    expect(canSeeOpportunity(consultor, { ownerId: 'c1', stage: 'negociacao' })).toBe(true);
  });

  it('consultor vê lead sem dono no pool (stage novo)', () => {
    expect(canSeeOpportunity(consultor, { ownerId: null, stage: 'novo' })).toBe(true);
  });

  it('consultor NÃO vê lead de outro consultor', () => {
    expect(canSeeOpportunity(consultor, { ownerId: 'c2', stage: 'novo' })).toBe(false);
  });

  it('consultor NÃO vê lead sem dono fora do estágio novo', () => {
    expect(canSeeOpportunity(consultor, { ownerId: null, stage: 'contato_inicial' })).toBe(false);
  });
});
