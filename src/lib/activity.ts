import { eq } from 'drizzle-orm';
import { db } from './db';
import { activities, opportunities } from './schema';

export type ActivityKind =
  | 'note'
  | 'call'
  | 'email'
  | 'whatsapp'
  | 'stage_change'
  | 'diagnostic_sent'
  | 'proposal_sent'
  | 'contract_signed'
  | 'handoff'
  | 'intake_submission'
  | 'task_created'
  | 'task_completed'
  | 'tags_updated'
  | 'bulk_reassign'
  | 'lost';

export async function logActivity(input: {
  opportunityId: number;
  type: ActivityKind;
  subject?: string;
  body?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  await db.insert(activities).values({
    opportunityId: input.opportunityId,
    type: input.type,
    subject: input.subject ?? null,
    body: input.body ?? null,
    actorId: input.actorId ?? null,
    metadata: input.metadata ?? {},
  });
  // Bump opportunity.last_activity_at so the rotten-deal detector stays accurate.
  await db
    .update(opportunities)
    .set({ lastActivityAt: now })
    .where(eq(opportunities.id, input.opportunityId));
}
