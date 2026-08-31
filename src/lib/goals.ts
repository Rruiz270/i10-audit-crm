/**
 * Metas comerciais por consultor — versão em código, sem tabela dedicada.
 *
 * Mantemos as metas como constantes (padrão + overrides por e-mail) para não
 * criar migração no banco compartilhado só para isso. Quando as metas virarem
 * dinâmicas (editáveis por admin), promover para uma tabela `crm.goals` e
 * manter esta API (`goalForUser`, `scaleGoalToWindow`) como fachada.
 */

export type ConsultantGoal = {
  /** Deals ganhos por mês. */
  wonPerMonth: number;
  /** Valor ganho por mês (R$). */
  valuePerMonth: number;
};

export const DEFAULT_GOAL: ConsultantGoal = {
  wonPerMonth: 2,
  valuePerMonth: 60_000,
};

/** Overrides por e-mail (minúsculo) — ex.: metas maiores para sêniores. */
export const GOAL_OVERRIDES: Record<string, ConsultantGoal> = {};

export function goalForUser(email: string | null | undefined): ConsultantGoal {
  if (!email) return DEFAULT_GOAL;
  return GOAL_OVERRIDES[email.toLowerCase()] ?? DEFAULT_GOAL;
}

/** Escala a meta mensal para a janela do relatório (7/30/90 dias). */
export function scaleGoalToWindow(goal: ConsultantGoal, windowDays: number): ConsultantGoal {
  const factor = windowDays / 30;
  return {
    wonPerMonth: Math.max(1, Math.round(goal.wonPerMonth * factor)),
    valuePerMonth: Math.round(goal.valuePerMonth * factor),
  };
}
