import { STAGES_BY_KEY, type StageKey, type StageDefinition } from './pipeline';

export type ForecastOp = {
  stage: string;
  estimatedValue?: number | null;
  lastActivityAt?: Date | null;
};

/**
 * Pipeline ponderado: soma `estimatedValue × probability(stage)` para todos
 * os estágios ativos (descarta terminais). É a métrica que o Pipedrive chama
 * de "weighted value" e que a Salesforce usa como base do forecast categórico.
 */
export function weightedValue(ops: ForecastOp[]): number {
  let total = 0;
  for (const op of ops) {
    const def = STAGES_BY_KEY[op.stage as StageKey] as StageDefinition | undefined;
    if (!def || def.isTerminal) continue;
    const v = op.estimatedValue;
    if (v == null) continue;
    total += v * def.probability;
  }
  return total;
}

/**
 * Retorna `true` se o deal está "parado" — não tem atividade há mais tempo
 * do que o `rotDays` do estágio atual. Estágios terminais não apodrecem.
 */
export function isRotten(op: ForecastOp, now: Date = new Date()): boolean {
  const def = STAGES_BY_KEY[op.stage as StageKey] as StageDefinition | undefined;
  if (!def || def.rotDays == null) return false;
  if (!op.lastActivityAt) return true;
  const ageMs = now.getTime() - new Date(op.lastActivityAt).getTime();
  return ageMs > def.rotDays * 24 * 3600 * 1000;
}

/**
 * Quantos dias até apodrecer (ou dias desde que apodreceu, se negativo).
 * Null em estágios terminais.
 */
export function daysUntilRot(op: ForecastOp, now: Date = new Date()): number | null {
  const def = STAGES_BY_KEY[op.stage as StageKey] as StageDefinition | undefined;
  if (!def || def.rotDays == null) return null;
  if (!op.lastActivityAt) return -Infinity;
  const ageDays =
    (now.getTime() - new Date(op.lastActivityAt).getTime()) / (24 * 3600 * 1000);
  return Math.round(def.rotDays - ageDays);
}
