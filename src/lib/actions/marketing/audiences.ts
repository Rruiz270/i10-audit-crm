'use server';

import { eq, desc, sql, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parse } from 'csv-parse/sync';
import { db } from '@/lib/db';
import { audiences, contacts, listMembers } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { batchIsSuppressed } from '@/lib/marketing/suppression';

export async function listAudiences(projectId: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  return db
    .select()
    .from(audiences)
    .where(eq(audiences.projectId, projectId))
    .orderBy(desc(audiences.createdAt));
}

export async function createAudience(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const projectId = Number(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const source = String(formData.get('source') ?? 'manual');

  if (!projectId || !name) throw new Error('projectId e name obrigatórios');

  await db.insert(audiences).values({ projectId, name, description, source });
  revalidatePath(`/marketing/${projectId}/audiences`);
  redirect(`/marketing/${projectId}/audiences`);
}

// ─── CSV import ────────────────────────────────────────────────────────────
// Aceita formato disparo-fundeb-brasil/data/disparo-nao-sp.csv:
// ibge,uf,municipio,populacao,prefeito_nome,prefeito_apelido,partido,
// email_prefeito_pessoal,email_prefeitura,email_educacao,
// cel_prefeito_pessoal,tel_prefeitura,tel_educacao,
// valor_potencial,pct_ganho,matriculas,cat_ativas,tempo_integral,
// vaar_status,ideb_ai,ideb_af,arquivo_pdf,link_pdf
//
// Cada linha vira N contatos (1 por email não vazio):
//   - email_prefeito_pessoal → role 'prefeito_pessoal'
//   - email_prefeitura       → role 'prefeitura'
//   - email_educacao         → role 'educacao'

type FundebRow = {
  ibge: string;
  uf: string;
  municipio: string;
  populacao?: string;
  prefeito_nome?: string;
  prefeito_apelido?: string;
  partido?: string;
  email_prefeito_pessoal?: string;
  email_prefeitura?: string;
  email_educacao?: string;
  cel_prefeito_pessoal?: string;
  tel_prefeitura?: string;
  tel_educacao?: string;
  valor_potencial?: string;
  pct_ganho?: string;
  matriculas?: string;
  cat_ativas?: string;
  tempo_integral?: string;
  vaar_status?: string;
  ideb_ai?: string;
  ideb_af?: string;
  arquivo_pdf?: string;
  link_pdf?: string;
};

const EMAIL_ROLES: Array<{ field: keyof FundebRow; role: string; phoneField?: keyof FundebRow }> = [
  { field: 'email_prefeito_pessoal', role: 'prefeito_pessoal', phoneField: 'cel_prefeito_pessoal' },
  { field: 'email_prefeitura', role: 'prefeitura', phoneField: 'tel_prefeitura' },
  { field: 'email_educacao', role: 'educacao', phoneField: 'tel_educacao' },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function importContactsFromCsv(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const projectId = Number(formData.get('projectId'));
  const audienceId = Number(formData.get('audienceId'));
  const csvFile = formData.get('csv') as File | null;
  const audienceName = String(formData.get('audienceName') ?? '').trim();
  const targetRole = String(formData.get('targetRole') ?? '').trim();

  if (!projectId || !csvFile) throw new Error('projectId e csv obrigatórios');

  let useAudienceId = audienceId;
  let useAudienceName = audienceName;
  if (!useAudienceId) {
    if (!audienceName) throw new Error('audienceId ou audienceName obrigatórios');
    const [a] = await db
      .insert(audiences)
      .values({
        projectId,
        name: audienceName,
        source: 'csv_upload',
        sourceMeta: { filename: csvFile.name, sizeBytes: csvFile.size },
      })
      .returning({ id: audiences.id });
    useAudienceId = a.id;
  } else {
    // Importando para audiência existente: pega o nome p/ tag de origem.
    const [a] = await db
      .select({ name: audiences.name })
      .from(audiences)
      .where(eq(audiences.id, useAudienceId))
      .limit(1);
    useAudienceName = a?.name ?? useAudienceName;
  }
  // Origem do contato (só set no INSERT — ON CONFLICT preserva o source antigo).
  const contactSource = `csv:${useAudienceName || 'import'}`;

  const csvText = await csvFile.text();
  let rows: FundebRow[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as FundebRow[];
  } catch (e) {
    throw new Error(`CSV inválido: ${e instanceof Error ? e.message : 'erro de parse'}`);
  }
  if (rows.length === 0) throw new Error('CSV vazio');

  // Coletar todos os emails primeiro pra dedupe + suppression check em batch
  type CandidateContact = {
    email: string;
    name: string;
    phone: string | null;
    role: string;
    ibge: string;
    municipio: string;
    uf: string;
    attributes: Record<string, unknown>;
  };
  const candidates: CandidateContact[] = [];
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const baseAttrs: Record<string, unknown> = {};
    // Snapshot de atributos pra mailmerge
    const attrFields = [
      'populacao',
      'prefeito_nome',
      'prefeito_apelido',
      'partido',
      'valor_potencial',
      'pct_ganho',
      'matriculas',
      'cat_ativas',
      'tempo_integral',
      'vaar_status',
      'ideb_ai',
      'ideb_af',
      'link_pdf',
    ] as const;
    for (const f of attrFields) {
      if (row[f]) baseAttrs[f] = row[f];
    }

    for (const { field, role, phoneField } of EMAIL_ROLES) {
      if (targetRole && targetRole !== role) continue;
      const email = (row[field] ?? '').trim().toLowerCase();
      if (!email || !isValidEmail(email)) continue;
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      const phone = phoneField ? (row[phoneField] ?? '').trim() || null : null;
      const name =
        role === 'prefeito_pessoal' && row.prefeito_nome
          ? row.prefeito_nome
          : `${role === 'prefeitura' ? 'Gabinete' : role === 'educacao' ? 'Sec. Educação' : ''} ${row.municipio ?? ''}`.trim();
      candidates.push({
        email,
        name,
        phone,
        role,
        ibge: row.ibge ?? '',
        municipio: row.municipio ?? '',
        uf: row.uf ?? '',
        attributes: baseAttrs,
      });
    }
  }

  // Filtrar suppressions (em batch)
  const allEmails = candidates.map((c) => c.email);
  const suppressedSet = await batchIsSuppressed(allEmails, 'email');
  const filtered = candidates.filter((c) => !suppressedSet.has(c.email));
  const skippedSuppressed = candidates.length - filtered.length;

  // Upsert contacts em chunks
  const chunkSize = 500;
  let insertedContacts = 0;
  let upsertedContacts = 0;
  const allContactIds: number[] = [];

  for (let i = 0; i < filtered.length; i += chunkSize) {
    const chunk = filtered.slice(i, i + chunkSize);
    // Insert com ON CONFLICT (email) DO UPDATE — preserva ID se já existir
    const result = await db
      .insert(contacts)
      .values(
        chunk.map((c) => ({
          email: c.email,
          name: c.name,
          phone: c.phone,
          ibge: c.ibge.slice(0, 7),
          municipio: c.municipio,
          uf: c.uf.slice(0, 2),
          role: c.role,
          source: contactSource,
          attributes: c.attributes,
          lgpdBasis: 'legitimate_interest',
          status: 'active',
        })),
      )
      .onConflictDoUpdate({
        target: contacts.email,
        set: {
          // Atualizar atributos (podem ter melhorado desde a importação anterior)
          attributes: sql`EXCLUDED.attributes`,
          municipio: sql`EXCLUDED.municipio`,
          uf: sql`EXCLUDED.uf`,
          ibge: sql`EXCLUDED.ibge`,
          // Só preenche source se ainda estiver vazio (não sobrescreve a origem real).
          source: sql`COALESCE(${contacts.source}, EXCLUDED.source)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: contacts.id });
    allContactIds.push(...result.map((r) => r.id));
    insertedContacts += result.length;
  }

  // Adicionar todos ao audience (idempotente via UNIQUE index)
  if (allContactIds.length > 0) {
    for (let i = 0; i < allContactIds.length; i += chunkSize) {
      const chunk = allContactIds.slice(i, i + chunkSize);
      await db
        .insert(listMembers)
        .values(chunk.map((cid) => ({ audienceId: useAudienceId, contactId: cid })))
        .onConflictDoNothing({ target: [listMembers.audienceId, listMembers.contactId] });
    }
  }

  // Atualizar contagem da audience
  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listMembers)
    .where(eq(listMembers.audienceId, useAudienceId));
  await db
    .update(audiences)
    .set({ contactCount: total[0].count })
    .where(eq(audiences.id, useAudienceId));

  revalidatePath(`/marketing/${projectId}/audiences`);
  redirect(`/marketing/${projectId}/audiences`);
}
