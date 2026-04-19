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

/**
 * LP da APM — form operacional preenchido pela equipe APM ao captar
 * prefeitos/secretários em campo. Diferente do intake público (/intake/fundeb)
 * porque aceita MÚLTIPLOS contatos por município num único submit.
 *
 * Ao submeter:
 *   · 1 lead_submission (registro bruto, payload completo)
 *   · 1 opportunity (estágio "novo", source "intake:apm-cadastro")
 *   · N contacts (primeiro = isPrimary, restante = secondary)
 *   · activity "intake_submission" com metadata do captador
 */

const APM_SLUG = 'apm-cadastro';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório').max(200),
  role: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
});

const submitSchema = z.object({
  municipalityId: z.coerce.number().int().positive('Selecione o município'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  apmCaptador: z.string().trim().max(120).optional().or(z.literal('')),
  contacts: z.array(contactSchema).min(1, 'Adicione pelo menos 1 contato').max(10),
});

export type ApmCadastroInput = z.infer<typeof submitSchema>;

export async function submitApmCadastro(data: ApmCadastroInput) {
  // Honeypot — se o form trouxer um campo "website" preenchido, é bot.
  // (Aceitamos o campo via data.notes.toLowerCase().startsWith('__bot__') ou similar,
  //  mas o honeypot real vai via POST form; aqui assumimos client já filtrou)

  const parsed = submitSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    };
  }
  const payload = parsed.data;

  // Valida que o município existe
  const mun = await db.query.fundebMunicipalities.findFirst({
    where: eq(fundebMunicipalities.id, payload.municipalityId),
  });
  if (!mun) {
    return { ok: false as const, error: 'Município não encontrado' };
  }

  // Pega / cria o form APM no banco pra /leads encontrar
  let form = await db.query.leadForms.findFirst({
    where: eq(leadForms.slug, APM_SLUG),
  });
  if (!form) {
    const [created] = await db
      .insert(leadForms)
      .values({
        slug: APM_SLUG,
        title: 'APM — Cadastro de Leads',
        description:
          'Formulário operacional da APM para registro de prefeitos e secretários captados em campo.',
        fieldsSchema: [],
        isActive: true,
      })
      .returning();
    form = created;
  }

  const hdrs = await headers();
  const sourceIp =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    null;
  const userAgent = hdrs.get('user-agent') ?? null;

  // Grava submission bruta com payload completo (múltiplos contatos)
  const [submission] = await db
    .insert(leadSubmissions)
    .values({
      formId: form.id,
      payload: {
        municipalityId: payload.municipalityId,
        municipalityName: mun.nome,
        apmCaptador: payload.apmCaptador ?? null,
        notes: payload.notes ?? null,
        contacts: payload.contacts,
      },
      sourceIp,
      userAgent,
    })
    .returning({ id: leadSubmissions.id });

  // Cria oportunidade
  const [op] = await db
    .insert(opportunities)
    .values({
      municipalityId: payload.municipalityId,
      stage: 'novo',
      source: `intake:${APM_SLUG}`,
      notes: payload.notes || null,
    })
    .returning({ id: opportunities.id });

  // Cria todos os contatos — primeiro é principal, resto secundário
  for (let i = 0; i < payload.contacts.length; i++) {
    const c = payload.contacts[i];
    await db.insert(contacts).values({
      opportunityId: op.id,
      name: c.name,
      role: c.role || null,
      phone: c.phone || null,
      email: c.email || null,
      isPrimary: i === 0,
    });
  }

  // Link submission à oportunidade
  await db
    .update(leadSubmissions)
    .set({ opportunityId: op.id })
    .where(eq(leadSubmissions.id, submission.id));

  // Activity log
  await logActivity({
    opportunityId: op.id,
    type: 'intake_submission',
    subject: `APM: ${mun.nome} (${payload.contacts.length} contato${payload.contacts.length > 1 ? 's' : ''})`,
    body: [
      payload.apmCaptador ? `Captado por: ${payload.apmCaptador}` : null,
      `Contatos:\n${payload.contacts.map((c) => `  · ${c.name}${c.role ? ` (${c.role})` : ''}${c.email ? ` — ${c.email}` : ''}`).join('\n')}`,
      payload.notes ? `Observações:\n${payload.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    metadata: {
      apmSlug: APM_SLUG,
      submissionId: submission.id,
      contactCount: payload.contacts.length,
    },
  });

  revalidatePath('/leads');
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');

  return {
    ok: true as const,
    opportunityId: op.id,
    municipalityName: mun.nome,
    contactCount: payload.contacts.length,
  };
}
