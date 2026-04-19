'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activities } from '@/lib/schema';
import { requireUser } from '@/lib/session';

const schema = z.object({
  opportunityId: z.coerce.number().int().positive(),
  type: z.enum([
    'note',
    'call',
    'email',
    'whatsapp',
    'diagnostic_sent',
    'proposal_sent',
    'contract_signed',
    'lost',
  ]),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  body: z.string().trim().max(10000).optional().or(z.literal('')),
});

export async function createActivity(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const data = parsed.data;
  await db.insert(activities).values({
    opportunityId: data.opportunityId,
    type: data.type,
    subject: data.subject || null,
    body: data.body || null,
    actorId: user.id,
    metadata: {},
  });
  revalidatePath(`/opportunities/${data.opportunityId}`);
  return { ok: true as const };
}

export async function deleteActivity(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = Number(formData.get('id'));
  const opportunityId = Number(formData.get('opportunityId'));
  await db.delete(activities).where(eq(activities.id, id));
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true as const };
}
