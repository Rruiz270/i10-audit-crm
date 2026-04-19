/**
 * Taxonomia fixa de motivos de perda — no estilo Salesforce/HubSpot.
 * Usar um picklist em vez de texto livre permite:
 *   - Agrupar perdas em /reports
 *   - Treinar o time nos padrões que mais matam deals
 *   - Evitar "typos" que escondem clusters (ex: "sem verba", "sem orçamento")
 */
export type LostReasonCode =
  | 'no_budget'
  | 'not_priority'
  | 'chose_competitor'
  | 'political_change'
  | 'no_decision'
  | 'out_of_scope'
  | 'timing_off'
  | 'ghosted'
  | 'other';

export const LOST_REASONS: Array<{
  code: LostReasonCode;
  label: string;
  hint?: string;
}> = [
  { code: 'no_budget', label: 'Sem verba disponível', hint: 'Município não tem orçamento alocado' },
  { code: 'not_priority', label: 'Não é prioridade agora', hint: 'Educação não está no topo da agenda' },
  { code: 'chose_competitor', label: 'Escolheu concorrente', hint: 'Outra consultoria fechou' },
  { code: 'political_change', label: 'Troca de gestão', hint: 'Eleição / nomeação quebrou a negociação' },
  { code: 'no_decision', label: 'Não conseguiu decidir', hint: 'Indecisão interna travou o deal' },
  { code: 'out_of_scope', label: 'Fora do escopo', hint: 'Pedido não era aderente ao nosso serviço' },
  { code: 'timing_off', label: 'Timing inadequado', hint: 'Bom fit, momento errado — revisitar em 6-12 meses' },
  { code: 'ghosted', label: 'Contato sumiu', hint: 'Parou de responder sem explicação' },
  { code: 'other', label: 'Outro', hint: 'Usar o campo de texto livre para detalhar' },
];

export const LOST_REASONS_BY_CODE = Object.fromEntries(
  LOST_REASONS.map((r) => [r.code, r]),
) as Record<LostReasonCode, (typeof LOST_REASONS)[number]>;

export function isValidLostReason(code: unknown): code is LostReasonCode {
  return typeof code === 'string' && code in LOST_REASONS_BY_CODE;
}
