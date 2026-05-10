// Sync insights.subscribers ↔ marketing.contacts
// Roda quando subscriber confirma email (LGPD double opt-in completo).
//
// Comportamento:
//   - Upsert em marketing.contacts por email (ou cria se não existir)
//   - Adiciona tag 'insight_subscriber' em attributes.tags
//   - lgpd_basis = 'consent' (subscriber explicitamente confirmou)
//
// Inverso (contact webinar → vira subscriber Insight) é OPT-IN do user
// no form de inscrição do webinar (checkbox "também quero Insight diário"),
// não automático.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts as marketingContacts } from '@/lib/schema-marketing';

export async function syncSubscriberToMarketingContacts(input: {
  email: string;
  locale: 'pt' | 'en';
  source: string; // 'insight_signup' | 'manual_admin'
}): Promise<{ contactId: number; created: boolean }> {
  const email = input.email.toLowerCase().trim();
  const tag = 'insight_subscriber';

  const existing = await db
    .select()
    .from(marketingContacts)
    .where(eq(marketingContacts.email, email))
    .limit(1);

  if (existing[0]) {
    const contact = existing[0];
    const attrs = (contact.attributes ?? {}) as Record<string, unknown>;
    const tags = Array.isArray(attrs.tags) ? (attrs.tags as string[]) : [];
    if (!tags.includes(tag)) {
      await db
        .update(marketingContacts)
        .set({
          attributes: { ...attrs, tags: [...tags, tag], locale: input.locale },
          lgpdBasis: 'consent',
          updatedAt: new Date(),
        })
        .where(eq(marketingContacts.id, contact.id));
    }
    return { contactId: contact.id, created: false };
  }

  const inserted = await db
    .insert(marketingContacts)
    .values({
      email,
      attributes: { tags: [tag], locale: input.locale, source: input.source },
      lgpdBasis: 'consent',
      status: 'active',
    })
    .returning({ id: marketingContacts.id });

  return { contactId: inserted[0].id, created: true };
}
