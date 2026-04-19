export type StageKey =
  | 'novo'
  | 'contato_inicial'
  | 'diagnostico_enviado'
  | 'follow_up'
  | 'reuniao_auditoria'
  | 'negociacao'
  | 'ganhou'
  | 'perdido';

export type StageDefinition = {
  key: StageKey;
  label: string;
  description: string;
  order: number;
  color: string;
  wipLimit: number | null;
  isTerminal: boolean;
  isWon: boolean;
  /**
   * Probabilidade de fechamento neste estágio (0..1). Usado para o pipeline
   * ponderado: `weighted = estimated_value × probability`.
   */
  probability: number;
  /**
   * Após quantos dias sem atividade o deal é considerado "parado" (rotten).
   * Null = nunca apodrece (ex.: estágios terminais).
   */
  rotDays: number | null;
  requiredFieldsToExit: Array<
    'primaryContact' | 'estimatedValue' | 'closeDate' | 'municipalityAssigned'
  >;
};

// TODO(raphael): confirm colors, WIP limits, and exit requirements per stage.
// Colors use Tailwind palette names (e.g. 'blue-500'). Null wipLimit = no cap.
// requiredFieldsToExit controls what must be filled before an opportunity can
// leave this stage — this is what turns a Kanban into a real process tool.
export const STAGES: StageDefinition[] = [
  {
    key: 'novo',
    label: 'Novo',
    description: 'Lead identificado (APM ou formulário). Ainda sem contato.',
    order: 1,
    color: 'slate-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.05,
    rotDays: 5,
    requiredFieldsToExit: ['municipalityAssigned', 'primaryContact'],
  },
  {
    key: 'contato_inicial',
    label: 'Contato Inicial',
    description: 'Primeiro contato telefônico ou vídeo com Prefeito/Secretário.',
    order: 2,
    color: 'blue-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.15,
    rotDays: 7,
    requiredFieldsToExit: [],
  },
  {
    key: 'diagnostico_enviado',
    label: 'Diagnóstico Enviado',
    description: 'Primeiro diagnóstico do município enviado para despertar interesse.',
    order: 3,
    color: 'indigo-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.3,
    rotDays: 10,
    requiredFieldsToExit: [],
  },
  {
    key: 'follow_up',
    label: 'Follow-up',
    description: 'Acompanhando se o município está engajando com o diagnóstico.',
    order: 4,
    color: 'violet-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.4,
    rotDays: 14,
    requiredFieldsToExit: [],
  },
  {
    key: 'reuniao_auditoria',
    label: 'Reunião de Auditoria',
    description: 'Segunda reunião (online ou presencial) com Secretaria da Educação.',
    order: 5,
    color: 'amber-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.6,
    rotDays: 10,
    requiredFieldsToExit: [],
  },
  {
    key: 'negociacao',
    label: 'Negociação',
    description: 'Proposta enviada, negociando termos.',
    order: 6,
    color: 'orange-500',
    wipLimit: null,
    isTerminal: false,
    isWon: false,
    probability: 0.8,
    rotDays: 7,
    requiredFieldsToExit: ['estimatedValue', 'closeDate'],
  },
  {
    key: 'ganhou',
    label: 'Ganhou',
    description: 'Deal fechado — dispara criação da consultoria no BNCC-CAPTACAO.',
    order: 7,
    color: 'emerald-500',
    wipLimit: null,
    isTerminal: true,
    isWon: true,
    probability: 1.0,
    rotDays: null,
    requiredFieldsToExit: [],
  },
  {
    key: 'perdido',
    label: 'Perdido',
    description: 'Deal perdido. Requer lostReason preenchido.',
    order: 99,
    color: 'rose-500',
    wipLimit: null,
    isTerminal: true,
    isWon: false,
    probability: 0.0,
    rotDays: null,
    requiredFieldsToExit: [],
  },
];

export const STAGES_BY_KEY = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<StageKey, StageDefinition>;

export const ACTIVE_STAGES = STAGES.filter((s) => !s.isTerminal);

/**
 * Colunas visíveis no Kanban: inclui "ganhou" pra que usuários arrastem
 * cards pra lá. Só exclui "perdido" (que tem fluxo próprio via StageControl,
 * porque exige motivo estruturado).
 */
export const KANBAN_STAGES = STAGES.filter((s) => s.key !== 'perdido');
