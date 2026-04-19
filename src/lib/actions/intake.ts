'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  contacts,
  fundebMunicipalities,
  leadForms,
  leadSubmissions,
  opportunities,
} from '@/lib/schema';
import { logActivity } from '@/lib/activity';

export type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'municipality';
  required?: boolean;
  options?: string[];
  help?: string;
};

export async function getFormBySlug(slug: string) {
  const row = await db.query.leadForms.findFirst({
    where: eq(leadForms.slug, slug),
  });
  return row ?? null;
}

export async function submitIntake(formData: FormData) {
  const slug = String(formData.get('_slug') ?? '').trim();
  const honeypot = String(formData.get('website') ?? '').trim();

  if (honeypot) {
    // Silent success — bots don't learn anything.
    return { ok: true as const, silent: true };
  }

  const form = await getFormBySlug(slug);
  if (!form || !form.isActive) {
    return { ok: false as const, error: 'Formulário não disponível.' };
  }

  const fields = (form.fieldsSchema as FieldDef[]) ?? [];
  const payload: Record<string, string> = {};
  const errors: string[] = [];

  for (const f of fields) {
    const raw = formData.get(f.name);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (f.required && !value) errors.push(`${f.label} é obrigatório`);
    if (f.type === 'email' && value) {
      const emailOk = z.string().email().safeParse(value).success;
      if (!emailOk) errors.push(`${f.label} inválido`);
    }
    payload[f.name] = value;
  }
  if (errors.length) return { ok: false as const, error: errors.join(' · ') };

  const hdrs = await headers();
  const sourceIp =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? null;
  const userAgent = hdrs.get('user-agent') ?? null;

  // Optional: if the form captured a municipality name/ID, try to resolve.
  let municipalityId: number | null = null;
  const munField = fields.find((f) => f.type === 'municipality');
  if (munField) {
    const v = payload[munField.name];
    if (v) {
      const mun = await db
        .select({ id: fundebMunicipalities.id })
        .from(fundebMunicipalities)
        .where(eq(fundebMunicipalities.nome, v))
        .limit(1);
      municipalityId = mun[0]?.id ?? null;
    }
  }

  // Atomic-ish intake: submission + opportunity + primary contact.
  const [submission] = await db
    .insert(leadSubmissions)
    .values({
      formId: form.id,
      payload,
      sourceIp,
      userAgent,
    })
    .returning({ id: leadSubmissions.id });

  const contactName =
    payload.name ||
    payload.nome ||
    payload.contact_name ||
    payload.responsavel ||
    '';
  const contactEmail = payload.email ?? null;
  const contactPhone = payload.phone ?? payload.telefone ?? null;
  const contactWhatsapp = payload.whatsapp ?? null;
  const contactRole = payload.role ?? payload.cargo ?? null;

  const source = `intake:${form.slug}`;
  const [op] = await db
    .insert(opportunities)
    .values({
      municipalityId,
      stage: 'novo',
      source,
      notes:
        (payload.message || payload.mensagem || payload.observacoes || '') || null,
    })
    .returning({ id: opportunities.id });

  if (contactName) {
    await db.insert(contacts).values({
      opportunityId: op.id,
      name: contactName,
      role: contactRole,
      email: contactEmail,
      phone: contactPhone,
      whatsapp: contactWhatsapp,
      isPrimary: true,
    });
  }

  await db
    .update(leadSubmissions)
    .set({ opportunityId: op.id })
    .where(eq(leadSubmissions.id, submission.id));

  await logActivity({
    opportunityId: op.id,
    type: 'intake_submission',
    subject: `Formulário público: ${form.title}`,
    body: JSON.stringify(payload, null, 2),
    metadata: { formSlug: form.slug, submissionId: submission.id },
  });

  revalidatePath('/leads');
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  revalidatePath('/');

  return { ok: true as const, opportunityId: op.id };
}

export async function triageLead(formData: FormData) {
  // Marks a submission as triaged; used when user confirms review.
  const id = Number(formData.get('id'));
  await db
    .update(leadSubmissions)
    .set({ triaged: true, triagedAt: new Date() })
    .where(eq(leadSubmissions.id, id));
  revalidatePath('/leads');
  return { ok: true as const };
}
