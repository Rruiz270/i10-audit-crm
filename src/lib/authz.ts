import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities } from '@/lib/schema';
import { canSeeOpportunity } from '@/lib/visibility';
import type { SessionUser } from '@/lib/session';

/**
 * Guarda anti-IDOR para mutações que recebem `opportunityId` do cliente:
 * carrega a oportunidade e valida com a mesma regra de visibilidade do
 * restante do app (dono, pool 'novo' sem dono, ou admin/gestor).
 *
 * Retorna a oportunidade quando o usuário pode agir sobre ela; `null` caso
 * não exista OU o usuário não possa vê-la (mesma resposta nos dois casos,
 * para não vazar a existência do registro).
 */
export async function getAccessibleOpportunity(
  user: SessionUser,
  opportunityId: number,
) {
  if (!Number.isFinite(opportunityId) || opportunityId <= 0) return null;
  const op = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });
  if (!op) return null;
  if (!canSeeOpportunity(user, { ownerId: op.ownerId, stage: op.stage })) {
    return null;
  }
  return op;
}
