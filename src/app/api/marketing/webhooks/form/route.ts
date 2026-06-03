import type { NextRequest } from 'next/server';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  contacts,
  sequenceMembers,
  consentLog,
  webhookLog,
} from '@/lib/schema-marketing';
import { enrollContactInSequence } from '@/lib/marketing/sequence-runner';

// ─── /api/marketing/webhooks/form — recebe form submissions externos ──────
// Usado por landing pages de inscrição (webinar/newsletter/etc) pra:
//   1. Criar/atualizar contact em marketing.contacts
//   2. Adicionar tag (ex: webinar_signup_2026)
//   3. Exit do sequence "pré-inscrição" se estiver lá
//   4. Enroll no sequence "pós-inscrição"
//   5. Log opt-in em consent_log (LGPD)
//
// Payload aceito (POST JSON):
//   {
//     projectSlug: 'webinar-fundeb-brasil-2026',  // ou projectId
//     email: 'prefeito@example.com',
//     name?: 'Nome',
//     phone?: '11999999999',
//     ibge?: '1234567',
//     municipio?: 'Cidade X',
//     uf?: 'SP',
//     attributes?: {...},
//     source?: 'webinar_form'  // origem do submit
//   }
//
// Project settings devem conter:
//   { preSequenceId, posSequenceId, signupTag }
//
// CORS habilitado pra forms em outros domínios (institutoi10.org.br/...).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { ok: false, error: 'invalid json' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Audit log primeiro — sempre persiste o webhook recebido pra debug
  const [logEntry] = await db
    .insert(webhookLog)
    .values({
      provider: 'form',
      eventType: String(body.source ?? 'signup'),
      rawPayload: body,
    })
    .returning({ id: webhookLog.id });

  try {
    const result = await processFormSubmission(body, request);
    await db
      .update(webhookLog)
      .set({ status: 'processed', processedAt: new Date(), resolvedSendId: null })
      .where(eq(webhookLog.id, logEntry.id));
    return Response.json({ ok: true, ...result }, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(webhookLog)
      .set({ status: 'error', errorMessage: message })
      .where(eq(webhookLog.id, logEntry.id));
    return Response.json(
      { ok: false, error: message },
      { status: 400, headers: CORS_HEADERS },
    );
  }
}

async function processFormSubmission(
  body: Record<string, unknown>,
  request: NextRequest,
): Promise<{
  contactId: number;
  tagged: string | null;
  exitedFromSequence: boolean;
  enrolledInSequence: number | null;
}> {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('invalid email');
  }

  // Resolver project — aceita projectId OU projectSlug
  let project: typeof projects.$inferSelect | undefined;
  if (body.projectId) {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, Number(body.projectId)))
      .limit(1);
    project = rows[0];
  } else if (body.projectSlug) {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, String(body.projectSlug)))
      .limit(1);
    project = rows[0];
  }
  if (!project) throw new Error('project not found (projectId or projectSlug required)');

  const settings = (project.settings ?? {}) as {
    preSequenceId?: number;
    posSequenceId?: number;
    signupTag?: string;
    createOpportunity?: boolean;
  };
  const signupTag = settings.signupTag ?? `${project.slug}:signup`;

  // Upsert contact por email
  const existingContact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, email))
    .limit(1);

  let contactId: number;
  if (existingContact[0]) {
    contactId = existingContact[0].id;
    // Merge tags + opcional update de campos
    const currentAttrs = (existingContact[0].attributes ?? {}) as Record<string, unknown>;
    const currentTags = Array.isArray(currentAttrs.tags) ? (currentAttrs.tags as string[]) : [];
    const newTags = currentTags.includes(signupTag)
      ? currentTags
      : [...currentTags, signupTag];
    const newAttrs: Record<string, unknown> = {
      ...currentAttrs,
      ...(body.attributes && typeof body.attributes === 'object' ? body.attributes : {}),
      tags: newTags,
    };
    const updateData: Record<string, unknown> = {
      attributes: newAttrs,
      updatedAt: new Date(),
    };
    if (body.name) updateData.name = String(body.name);
    if (body.phone) updateData.phone = String(body.phone);
    if (body.ibge) updateData.ibge = String(body.ibge).slice(0, 7);
    if (body.municipio) updateData.municipio = String(body.municipio);
    if (body.uf) updateData.uf = String(body.uf).slice(0, 2);

    await db.update(contacts).set(updateData).where(eq(contacts.id, contactId));
  } else {
    const inserted = await db
      .insert(contacts)
      .values({
        email,
        name: body.name ? String(body.name) : null,
        phone: body.phone ? String(body.phone) : null,
        ibge: body.ibge ? String(body.ibge).slice(0, 7) : null,
        municipio: body.municipio ? String(body.municipio) : null,
        uf: body.uf ? String(body.uf).slice(0, 2) : null,
        attributes: {
          ...(body.attributes && typeof body.attributes === 'object' ? body.attributes : {}),
          tags: [signupTag],
        },
        lgpdBasis: 'consent', // form submission = consent explícito
        status: 'active',
      })
      .returning({ id: contacts.id });
    contactId = inserted[0].id;
  }

  // Log consent (LGPD: opt-in form)
  await db.insert(consentLog).values({
    contactId,
    identifier: email,
    channel: 'email',
    action: 'opt_in',
    legalBasis: 'consent',
    source: 'form',
    sourceRef: String(body.source ?? 'webhook'),
    sourceIp: request.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    consentText: `Form submission to project ${project.slug}`,
  });

  // Branching: exit pre-sequence + enroll pos-sequence
  let exitedFromSequence = false;
  let enrolledInSequence: number | null = null;

  if (settings.preSequenceId) {
    const updated = await db
      .update(sequenceMembers)
      .set({ exitedAt: new Date(), exitReason: `tag:${signupTag}` })
      .where(
        and(
          eq(sequenceMembers.sequenceId, settings.preSequenceId),
          eq(sequenceMembers.contactId, contactId),
          isNull(sequenceMembers.exitedAt),
        ),
      )
      .returning({ id: sequenceMembers.id });
    exitedFromSequence = updated.length > 0;
  }

  if (settings.posSequenceId) {
    const enrollResult = await enrollContactInSequence(contactId, settings.posSequenceId);
    if (enrollResult.enrolled) enrolledInSequence = settings.posSequenceId;
  }

  // ─── Ponte: quem agenda vira oportunidade no pipeline (crm.opportunities) ──
  // Escopado por settings.createOpportunity (só projetos que optam, ex: PB).
  // Defensivo: NUNCA quebra o cadastro do lead — falha aqui só loga.
  if (settings.createOpportunity) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const q = neon(process.env.DATABASE_URL!);
      const src = `agendamento_${project.slug}`;
      // idempotente: não duplica oportunidade pro mesmo e-mail nesta origem
      const existing = await q`
        select 1 from crm.contacts cc
        join crm.opportunities oo on oo.id = cc.opportunity_id
        where lower(cc.email) = ${email} and oo.source = ${src} limit 1`;
      if (existing.length === 0) {
        // consultor ativo com menos oportunidades (load-balance)
        const owner = await q`
          select id from crm.users
          where role = 'consultor' and is_active = true
          order by (select count(*) from crm.opportunities o where o.owner_id = crm.users.id) asc, id asc
          limit 1`;
        const ownerId = owner[0]?.id ?? null;
        const oppNotes =
          `Agendou diagnóstico no Smart Cities Park (LP /pa-smart). Município: ${String(body.municipio ?? '')}`;
        const opp = await q`
          insert into crm.opportunities (owner_id, stage, source, notes)
          values (${ownerId}, 'novo', ${src}, ${oppNotes}) returning id`;
        const oppId = opp[0].id;
        await q`
          insert into crm.contacts (opportunity_id, name, email, phone, role, is_primary)
          values (${oppId}, ${String(body.name ?? email.split('@')[0])}, ${email},
                  ${body.phone ? String(body.phone) : null}, 'prefeitura', true)`;
        await q`
          insert into crm.activities (opportunity_id, type, subject, body, metadata)
          values (${oppId}, 'agendamento', 'Agendou no Smart Cities Park',
                  ${`Lead criado via LP /pa-smart. E-mail: ${email}`},
                  ${JSON.stringify({ source: src, marketingContactId: contactId })})`;
      }
    } catch (err) {
      console.error('[pb-opp-bridge] falhou (lead preservado):', err);
    }
  }

  return { contactId, tagged: signupTag, exitedFromSequence, enrolledInSequence };
}
