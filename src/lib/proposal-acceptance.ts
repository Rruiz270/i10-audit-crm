import { PRODUCTS } from './products';

// ─── Regras puras do aceite digital de proposta ─────────────────────────────
// O aceite público (página /proposta/[propId]?t=token) precisa reproduzir as
// consequências do "Ganhou" sem passar pelo changeStage (que exige sessão):
// contrato assinado, valor, produtos, estágio e elegibilidade de handoff.
// Mantido puro (sem db) para ser coberto por Vitest — afeta dados de produção
// compartilhados com o BNCC-CAPTACAO.

export type AcceptanceOpportunity = {
  stage: string;
  products: string[] | null;
  estimatedValue: number | null;
  closeDate: Date | null;
  contractNotes: string | null;
  municipalityId: number | null;
  handedOffConsultoriaId: number | null;
};

export type AcceptanceProposal = {
  number: string;
  version: number;
  products: string[] | null;
  total: number | null;
};

export type AcceptancePlan = {
  /** Patch a aplicar em crm.opportunities. */
  patch: {
    contractSigned: true;
    contractNotes: string;
    updatedAt: Date;
    stage?: 'ganhou';
    stageUpdatedAt?: Date;
    wonAt?: Date;
    estimatedValue?: number;
    closeDate?: Date;
    products?: string[];
  };
  /** Produtos finais da oportunidade após o aceite. */
  finalProducts: string[];
  /** Produtos não-FUNDEB que ganham tarefa de kickoff (paridade com changeStage). */
  kickoffProducts: string[];
  /** Handoff automático → fundeb.consultorias deve ser disparado? */
  shouldHandoff: boolean;
};

const FUNDEB_PRODUCT = 'Acelerador FUNDEB';

export function buildAcceptContractNote(
  proposal: AcceptanceProposal,
  acceptedByName: string,
  acceptedByRole: string | null,
  now: Date,
): string {
  return (
    `Aceite digital da proposta ${proposal.number} v${proposal.version} por ` +
    `${acceptedByName}${acceptedByRole ? ` (${acceptedByRole})` : ''} em ` +
    `${now.toLocaleDateString('pt-BR')} via página pública.`
  );
}

export function planAcceptance(
  op: AcceptanceOpportunity,
  proposal: AcceptanceProposal,
  acceptedByName: string,
  acceptedByRole: string | null,
  now: Date,
): AcceptancePlan {
  const note = buildAcceptContractNote(proposal, acceptedByName, acceptedByRole, now);

  // Produtos: a oportunidade é a fonte de verdade se já tiver; senão herda os
  // da proposta (filtrados pelo catálogo, como faz o changeStage).
  const existing = (op.products ?? []).filter(Boolean);
  const fromProposal = (proposal.products ?? []).filter((p) =>
    (PRODUCTS as readonly string[]).includes(p),
  );
  const finalProducts = existing.length ? existing : fromProposal;

  const patch: AcceptancePlan['patch'] = {
    contractSigned: true,
    contractNotes: op.contractNotes ? `${op.contractNotes}\n${note}` : note,
    updatedAt: now,
  };

  // Move para Ganhou (encurta Negociação→Ganhou). 'perdido' também reabre como
  // ganho: o cliente aceitou formalmente, o que supera a perda registrada.
  if (op.stage !== 'ganhou') {
    patch.stage = 'ganhou';
    patch.stageUpdatedAt = now;
    patch.wonAt = now;
  }
  if (proposal.total != null && proposal.total > 0) {
    patch.estimatedValue = proposal.total;
  }
  if (!op.closeDate) patch.closeDate = now;
  if (!existing.length && fromProposal.length) patch.products = fromProposal;

  // Kickoffs não-FUNDEB só quando o Ganho acontece agora (evita duplicar
  // tarefas se a opp já estava ganha por outro caminho).
  const kickoffProducts =
    op.stage !== 'ganhou' ? finalProducts.filter((p) => p !== FUNDEB_PRODUCT) : [];

  const shouldHandoff =
    finalProducts.includes(FUNDEB_PRODUCT) &&
    op.municipalityId != null &&
    op.handedOffConsultoriaId == null;

  return { patch, finalProducts, kickoffProducts, shouldHandoff };
}
