import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts as mkContacts } from '@/lib/schema-marketing';
import { normalizeBrPhone, isBrMobile, phoneMatchKey } from '@/lib/phone-utils';

// ─── Ponte de identidade crm ↔ marketing ────────────────────────────────────
// Regra de ouro: ninguém nasce "só no CRM". Ao criar um contato numa
// oportunidade, casamos com a base única (marketing.contacts / Leads Hub) por
// e-mail exato ou pelos últimos 11 dígitos do telefone — e, se não existir,
// criamos lá também. O id retornado vai em crm.contacts.marketing_contact_id.

export type BridgeInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  municipio?: string | null;
  uf?: string | null;
  role?: string | null;
  source: string; // ex.: 'apm', 'intake:fundeb', 'crm:manual'
};

export async function resolveMarketingContactId(input: BridgeInput): Promise<number | null> {
  const email = input.email?.trim().toLowerCase() || null;
  const e164 = normalizeBrPhone(input.whatsapp ?? input.phone);
  const key = phoneMatchKey(input.whatsapp ?? input.phone);

  // 1) casar por e-mail exato
  if (email) {
    const byEmail = await db
      .select({ id: mkContacts.id })
      .from(mkContacts)
      .where(sql`lower(${mkContacts.email}) = ${email}`)
      .limit(1);
    if (byEmail[0]) return byEmail[0].id;
  }

  // 2) casar pelos últimos 11 dígitos do telefone
  if (key) {
    const byPhone = await db
      .select({ id: mkContacts.id })
      .from(mkContacts)
      .where(
        sql`right(regexp_replace(coalesce(${mkContacts.whatsapp}, ${mkContacts.phone}), '\\D', '', 'g'), 11) = ${key}`,
      )
      .limit(1);
    if (byPhone[0]) return byPhone[0].id;
  }

  // 3) não existe → cria na base única (best-effort; nunca bloqueia o CRM)
  if (!email && !e164) return null;
  try {
    const [created] = await db
      .insert(mkContacts)
      .values({
        name: input.name,
        email: email,
        phone: e164 ?? input.phone ?? null,
        whatsapp: isBrMobile(e164) ? e164 : null,
        municipio: input.municipio ?? null,
        uf: input.uf ?? null,
        role: input.role ?? null,
        source: input.source,
        status: 'active',
      })
      .onConflictDoNothing({ target: mkContacts.email })
      .returning({ id: mkContacts.id });
    if (created) return created.id;
    // conflito de e-mail (corrida): busca de novo
    if (email) {
      const again = await db
        .select({ id: mkContacts.id })
        .from(mkContacts)
        .where(sql`lower(${mkContacts.email}) = ${email}`)
        .limit(1);
      return again[0]?.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
