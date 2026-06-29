import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { opportunities } from '@/lib/schema';
import { isAdmin } from '@/lib/roles';

/**
 * Regra de visibilidade de leads/oportunidades.
 *
 *  - admin / gestor  → veem TUDO (todos os pipelines de todos).
 *  - consultor       → vê os próprios leads (ownerId == ele) + o POOL público:
 *                      leads sem dono que ainda estão em 'novo'.
 *
 * Assim que um consultor "pega" um lead (vira dono), ele sai do pool e só ele
 * (e admin/gestor) passam a enxergá-lo.
 */
export type Viewer = { id: string; role: string };

/** Condição drizzle para o `.where(...)` de queries sobre `opportunities`. */
export function visibilityCondition(viewer: Viewer): SQL | undefined {
  if (isAdmin(viewer.role)) return undefined; // sem restrição
  return or(
    eq(opportunities.ownerId, viewer.id),
    and(isNull(opportunities.ownerId), eq(opportunities.stage, 'novo')),
  );
}

/** Versão em memória — para checar um registro já carregado (ex.: detalhe). */
export function canSeeOpportunity(
  viewer: Viewer,
  op: { ownerId: string | null; stage: string },
): boolean {
  if (isAdmin(viewer.role)) return true;
  if (op.ownerId && op.ownerId === viewer.id) return true;
  return op.ownerId == null && op.stage === 'novo';
}
