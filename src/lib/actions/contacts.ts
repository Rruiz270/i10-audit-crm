'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { contacts } from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';
import { getAccessibleOpportunity } from '@/lib/authz';
import { normalizeBrPhone, isBrMobile } from '@/lib/phone-utils';
import { resolveMarketingContactId } from '@/lib/contact-bridge';

const createSchema = z.object({
  opportunityId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, 'Nome muito curto').max(200),
  role: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  whatsapp: z.string().trim().max(32).optional().or(z.literal('')),
  isPrimary: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function createContact(formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const data = parsed.data;
  if (!(await getAccessibleOpportunity(user, data.opportunityId))) {
    return { ok: false as const, error: 'Oportunidade não encontrada' };
  }
  const makePrimary = data.isPrimary === 'on' || data.isPrimary === 'true';

  if (makePrimary) {
    await db
      .update(contacts)
      .set({ isPrimary: false })
      .where(eq(contacts.opportunityId, data.opportunityId));
  }

  const phoneE164 = normalizeBrPhone(data.phone) ?? (data.phone || null);
  const waE164 =
    normalizeBrPhone(data.whatsapp) ??
    (isBrMobile(normalizeBrPhone(data.phone)) ? normalizeBrPhone(data.phone) : data.whatsapp || null);
  // Ponte com a base única (Leads Hub) — casa ou cria a pessoa lá.
  const marketingContactId = await resolveMarketingContactId({
    name: data.name,
    email: data.email || null,
    phone: phoneE164,
    whatsapp: waE164,
    role: data.role || null,
    source: 'crm:manual',
  });
  const [created] = await db
    .insert(contacts)
    .values({
      opportunityId: data.opportunityId,
      name: data.name,
      role: data.role || null,
      email: data.email || null,
      phone: phoneE164,
      whatsapp: waE164,
      isPrimary: makePrimary,
      notes: data.notes || null,
      marketingContactId,
    })
    .returning({ id: contacts.id });

  await logActivity({
    opportunityId: data.opportunityId,
    type: 'note',
    subject: `Contato adicionado: ${data.name}`,
    actorId: user.id,
    metadata: { contactId: created.id },
  });

  revalidatePath(`/opportunities/${data.opportunityId}`);
  return { ok: true as const, id: created.id };
}

export async function setPrimaryContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const contactId = Number(formData.get('contactId'));
  const opportunityId = Number(formData.get('opportunityId'));
  if (!Number.isFinite(contactId) || !Number.isFinite(opportunityId)) {
    throw new Error('IDs inválidos');
  }
  if (!(await getAccessibleOpportunity(user, opportunityId))) {
    throw new Error('Oportunidade não encontrada');
  }
  await db
    .update(contacts)
    .set({ isPrimary: false })
    .where(
      and(eq(contacts.opportunityId, opportunityId), ne(contacts.id, contactId)),
    );
  await db
    .update(contacts)
    .set({ isPrimary: true })
    .where(and(eq(contacts.id, contactId), eq(contacts.opportunityId, opportunityId)));
  await logActivity({
    opportunityId,
    type: 'note',
    subject: 'Contato principal atualizado',
    actorId: user.id,
    metadata: { contactId },
  });
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function deleteContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const contactId = Number(formData.get('contactId'));
  const opportunityId = Number(formData.get('opportunityId'));
  if (!(await getAccessibleOpportunity(user, opportunityId))) {
    throw new Error('Oportunidade não encontrada');
  }
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.opportunityId, opportunityId)));
  await logActivity({
    opportunityId,
    type: 'note',
    subject: 'Contato removido',
    actorId: user.id,
    metadata: { contactId },
  });
  revalidatePath(`/opportunities/${opportunityId}`);
}
