import { describe, expect, it } from 'vitest';
import {
  buildAcceptContractNote,
  planAcceptance,
  type AcceptanceOpportunity,
  type AcceptanceProposal,
} from '@/lib/proposal-acceptance';

const NOW = new Date('2026-07-27T12:00:00-03:00');

function op(overrides: Partial<AcceptanceOpportunity> = {}): AcceptanceOpportunity {
  return {
    stage: 'negociacao',
    products: [],
    estimatedValue: null,
    closeDate: null,
    contractNotes: null,
    municipalityId: 42,
    handedOffConsultoriaId: null,
    ...overrides,
  };
}

function proposal(overrides: Partial<AcceptanceProposal> = {}): AcceptanceProposal {
  return {
    number: 'P-0007',
    version: 2,
    products: ['Acelerador FUNDEB'],
    total: 15000,
    ...overrides,
  };
}

describe('planAcceptance — aceite digital vira Ganhou + handoff', () => {
  it('negociação + FUNDEB: marca contrato, move pra ganhou e libera handoff', () => {
    const plan = planAcceptance(op(), proposal(), 'Maria Silva', 'Secretária de Educação', NOW);
    expect(plan.patch.contractSigned).toBe(true);
    expect(plan.patch.stage).toBe('ganhou');
    expect(plan.patch.wonAt).toEqual(NOW);
    expect(plan.patch.estimatedValue).toBe(15000);
    expect(plan.patch.closeDate).toEqual(NOW);
    expect(plan.patch.products).toEqual(['Acelerador FUNDEB']);
    expect(plan.shouldHandoff).toBe(true);
    // FUNDEB não gera tarefa de kickoff — pós-venda dele é o handoff.
    expect(plan.kickoffProducts).toEqual([]);
  });

  it('opp já ganha: não repete patch de estágio nem duplica kickoffs', () => {
    const plan = planAcceptance(
      op({ stage: 'ganhou', products: ['Escola Online'] }),
      proposal({ products: ['Escola Online'] }),
      'Maria Silva',
      null,
      NOW,
    );
    expect(plan.patch.stage).toBeUndefined();
    expect(plan.patch.wonAt).toBeUndefined();
    expect(plan.kickoffProducts).toEqual([]);
    expect(plan.shouldHandoff).toBe(false);
  });

  it('produtos não-FUNDEB: geram kickoff e não disparam handoff', () => {
    const plan = planAcceptance(
      op(),
      proposal({ products: ['Escola Online', 'Município Bilíngue'] }),
      'João',
      null,
      NOW,
    );
    expect(plan.kickoffProducts).toEqual(['Escola Online', 'Município Bilíngue']);
    expect(plan.shouldHandoff).toBe(false);
  });

  it('produtos da opp têm precedência; os da proposta são filtrados pelo catálogo', () => {
    const withExisting = planAcceptance(
      op({ products: ['Ensino Integral'] }),
      proposal({ products: ['Acelerador FUNDEB'] }),
      'João',
      null,
      NOW,
    );
    expect(withExisting.finalProducts).toEqual(['Ensino Integral']);
    expect(withExisting.patch.products).toBeUndefined();
    expect(withExisting.shouldHandoff).toBe(false);

    const filtered = planAcceptance(
      op(),
      proposal({ products: ['Produto Inventado', 'Radar Fiscal 360'] }),
      'João',
      null,
      NOW,
    );
    expect(filtered.finalProducts).toEqual(['Radar Fiscal 360']);
  });

  it('sem município ou já transferida: nunca dispara handoff', () => {
    expect(
      planAcceptance(op({ municipalityId: null }), proposal(), 'João', null, NOW).shouldHandoff,
    ).toBe(false);
    expect(
      planAcceptance(op({ handedOffConsultoriaId: 99 }), proposal(), 'João', null, NOW)
        .shouldHandoff,
    ).toBe(false);
  });

  it('preserva contractNotes existentes e não zera valor sem total', () => {
    const plan = planAcceptance(
      op({ contractNotes: 'Minuta enviada em junho.', estimatedValue: 9000, closeDate: NOW }),
      proposal({ total: null }),
      'Maria Silva',
      'Prefeita',
      NOW,
    );
    expect(plan.patch.contractNotes.startsWith('Minuta enviada em junho.\n')).toBe(true);
    expect(plan.patch.contractNotes).toContain('Maria Silva (Prefeita)');
    expect(plan.patch.estimatedValue).toBeUndefined();
    expect(plan.patch.closeDate).toBeUndefined();
  });
});

describe('buildAcceptContractNote', () => {
  it('inclui proposta, nome, cargo e data', () => {
    const note = buildAcceptContractNote(proposal(), 'Maria', 'Secretária', NOW);
    expect(note).toContain('P-0007 v2');
    expect(note).toContain('Maria (Secretária)');
    expect(note).toContain('27/07/2026');
  });
});
