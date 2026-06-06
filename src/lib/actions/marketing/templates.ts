'use server';

import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { templates } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { extractVariables, renderEmail, generateTrackingToken } from '@/lib/marketing/template-engine';

export async function listTemplates(projectId: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  return db
    .select()
    .from(templates)
    .where(eq(templates.projectId, projectId))
    .orderBy(desc(templates.createdAt));
}

export async function getTemplate(id: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const rows = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createTemplate(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const projectId = Number(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  const channel = String(formData.get('channel') ?? 'email');
  const subject = String(formData.get('subject') ?? '').trim() || null;
  const html = String(formData.get('html') ?? '').trim() || null;
  const text = String(formData.get('text') ?? '').trim() || null;
  // WhatsApp: Content SID (HX...) de um template aprovado pela Meta + idioma.
  // Necessário pra disparar fora da janela de 24h (cold outreach a prefeitos).
  const waTemplateName = String(formData.get('waTemplateName') ?? '').trim() || null;
  const waTemplateLanguage = String(formData.get('waTemplateLanguage') ?? '').trim() || 'pt_BR';

  if (!projectId || !name) throw new Error('projectId e name obrigatórios');
  if (channel === 'email' && (!html || !subject)) {
    throw new Error('Email exige subject + html');
  }
  // Freeform precisa de text; template aprovado precisa do Content SID.
  if (channel === 'whatsapp' && !text && !waTemplateName) {
    throw new Error('WhatsApp exige a mensagem (freeform) OU um Content SID aprovado');
  }

  const allText = `${subject ?? ''} ${html ?? ''} ${text ?? ''}`;
  const variables = extractVariables(allText);

  await db.insert(templates).values({
    projectId,
    name,
    channel,
    subject,
    html,
    text,
    waTemplateName,
    waTemplateLanguage,
    variables,
    status: 'active',
  });

  revalidatePath(`/marketing/${projectId}`);
  revalidatePath(`/marketing/${projectId}/templates`);
  redirect(`/marketing/${projectId}/templates`);
}

export async function previewTemplate(formData: FormData) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const html = String(formData.get('html') ?? '');
  const subject = String(formData.get('subject') ?? '');
  // Sample merge vars — usar valores do primeiro município pro preview ficar realista
  const sampleVars = {
    ibge: '1200401',
    municipio: 'RIO BRANCO',
    uf: 'AC',
    prefeito_nome: 'Tião Bocalom',
    prefeito_apelido: 'Bocalom',
    partido: 'PL',
    populacao: '419.452',
    valor_potencial: 'R$ 89.141.709',
    pct_ganho: '42,03%',
    matriculas: '25.973',
    cat_ativas: '14/15',
    tempo_integral: '20,40%',
    vaar_status: 'NÃO RECEBE',
    ideb_ai: '6,2',
    ideb_af: '4,9',
    link_pdf: 'https://institutoi10.com.br/fundeb-2026/example.pdf',
    link_inscricao: 'https://webinar-fundeb.institutoi10.org.br/?ibge=1200401',
    data_webinar: '21 de maio de 2026',
    hora_webinar: '19h00 (Brasília)',
  };
  const rendered = renderEmail(
    { subject, html },
    sampleVars,
    {
      trackingBaseUrl: process.env.MARKETING_BASE_URL ?? 'http://localhost:3001',
      trackingToken: generateTrackingToken(),
      unsubscribeSecret: process.env.MARKETING_UNSUB_SECRET ?? 'dev-secret',
      recipientEmail: 'preview@example.com',
      senderIdentity: {
        name: process.env.MARKETING_FROM_NAME ?? 'Instituto i10',
        email: process.env.MARKETING_FROM_EMAIL ?? 'contato@institutoi10.org.br',
      },
    },
  );
  return {
    ok: true as const,
    rendered: {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      variablesReferenced: rendered.variablesReferenced,
      variablesMissing: rendered.variablesMissing,
      linkCount: rendered.linkCount,
    },
  };
}
