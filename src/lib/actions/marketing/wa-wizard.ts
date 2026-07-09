'use server';

import { and, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  audiences,
  campaigns,
  contacts,
  listMembers,
  projects,
  templates,
} from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';

// ─── Wizard "Nova campanha WhatsApp" — camada de dados + criação ────────────
// Fluxo: escolher template aprovado (Content SID) → compor público (filtros do
// Leads Hub, audiência existente ou lista colada) → criar campanha draft → a
// página da campanha faz dry-run/launch com o pipeline já existente.

export type WaWizardFilters = {
  q?: string;
  source?: string;
  uf?: string;
  role?: string;
};

export type WaPublicMode = 'filters' | 'audience' | 'paste';

// Templates WhatsApp prontos pra disparo frio: precisam de Content SID (HX…)
// aprovado pela Meta. Standalone (project_id NULL) ou de qualquer projeto —
// o template é da conta Twilio, não do projeto.
export async function getWaWizardData() {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const [tpls, projs, auds, ufF, sourceF, roleF] = await Promise.all([
    db
      .select({
        id: templates.id,
        name: templates.name,
        category: templates.category,
        waTemplateName: templates.waTemplateName,
        text: templates.text,
      })
      .from(templates)
      .where(
        and(
          eq(templates.channel, 'whatsapp'),
          isNotNull(templates.waTemplateName),
          sql`${templates.status} != 'archived'`,
        ),
      )
      .orderBy(desc(templates.createdAt)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(desc(projects.createdAt)),
    db
      .select({
        id: audiences.id,
        name: audiences.name,
        contactCount: audiences.contactCount,
        projectId: audiences.projectId,
        projectName: projects.name,
      })
      .from(audiences)
      .leftJoin(projects, eq(audiences.projectId, projects.id))
      .orderBy(desc(audiences.createdAt))
      .limit(100),
    facetQuery(contacts.uf),
    facetQuery(contacts.source),
    facetQuery(contacts.role),
  ]);

  return { templates: tpls, projects: projs, audiences: auds, facets: { uf: ufF, source: sourceF, role: roleF } };
}

async function facetQuery(col: typeof contacts.uf | typeof contacts.source | typeof contacts.role) {
  const rows = await db
    .select({ value: col, count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(isNotNull(col), eq(contacts.status, 'active')))
    .groupBy(col)
    .orderBy(desc(sql`count(*)`))
    .limit(60);
  return rows.filter((r): r is { value: string; count: number } => r.value != null);
}

function filterConditions(f: WaWizardFilters): SQL[] {
  const conds: SQL[] = [eq(contacts.status, 'active')];
  if (f.q) {
    const term = `%${f.q.trim()}%`;
    const c = or(
      ilike(contacts.name, term),
      ilike(contacts.email, term),
      ilike(contacts.phone, term),
      ilike(contacts.municipio, term),
      ilike(contacts.uf, term),
    );
    if (c) conds.push(c);
  }
  if (f.source) conds.push(eq(contacts.source, f.source));
  if (f.uf) conds.push(eq(contacts.uf, f.uf));
  if (f.role) conds.push(eq(contacts.role, f.role));
  return conds;
}

const hasPhone = () => or(isNotNull(contacts.whatsapp), isNotNull(contacts.phone))!;

// Prévia do recorte por filtros: quantos contatos batem e quantos têm telefone
// (só os com telefone entram na audiência de uma campanha WhatsApp).
export async function previewWaFilters(f: WaWizardFilters) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const [row] = await db
    .select({
      matched: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.whatsapp} IS NOT NULL OR ${contacts.phone} IS NOT NULL)::int`,
    })
    .from(contacts)
    .where(and(...filterConditions(f)));
  return { matched: row?.matched ?? 0, withPhone: row?.withPhone ?? 0 };
}

// ─── Lista colada (e-mails e/ou telefones, um por linha ou separados por vírgula)
// Telefone casa pelos últimos 11 dígitos (DDD+9); tolera +55, máscara, espaços.
function parsePastedList(raw: string) {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const keys11: string[] = [];
  const keys10: string[] = [];
  for (const t of tokens) {
    if (t.includes('@')) {
      emails.push(t.toLowerCase());
      continue;
    }
    let d = t.replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length >= 11) keys11.push(d.slice(-11));
    else if (d.length === 10) keys10.push(d);
  }
  return { tokens, emails, keys11, keys10 };
}

const dbPhoneDigits = sql`regexp_replace(coalesce(${contacts.whatsapp}, ${contacts.phone}), '\\D', '', 'g')`;

function pastedConditions(parsed: ReturnType<typeof parsePastedList>): SQL | null {
  const parts: SQL[] = [];
  if (parsed.emails.length) parts.push(inArray(sql`lower(${contacts.email})`, parsed.emails));
  if (parsed.keys11.length) parts.push(inArray(sql`right(${dbPhoneDigits}, 11)`, parsed.keys11));
  if (parsed.keys10.length) parts.push(inArray(sql`right(${dbPhoneDigits}, 10)`, parsed.keys10));
  if (!parts.length) return null;
  return or(...parts)!;
}

export async function previewWaPaste(raw: string) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const parsed = parsePastedList(raw);
  const cond = pastedConditions(parsed);
  if (!cond) return { tokens: parsed.tokens.length, matched: 0, withPhone: 0 };
  const [row] = await db
    .select({
      matched: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.whatsapp} IS NOT NULL OR ${contacts.phone} IS NOT NULL)::int`,
    })
    .from(contacts)
    .where(and(eq(contacts.status, 'active'), cond));
  return { tokens: parsed.tokens.length, matched: row?.matched ?? 0, withPhone: row?.withPhone ?? 0 };
}

// ─── Criação: monta a audiência (se preciso) + campanha draft ───────────────
export async function createWaCampaign(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const name = String(formData.get('name') ?? '').trim();
  const templateId = Number(formData.get('templateId'));
  const ratePerMinute = Math.min(1000, Math.max(1, Number(formData.get('ratePerMinute') ?? 30)));
  const mode = String(formData.get('mode') ?? 'filters') as WaPublicMode;
  if (!name || !templateId) throw new Error('nome e template são obrigatórios');

  // Template precisa ser WhatsApp com Content SID aprovado (disparo frio).
  const [tpl] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!tpl || tpl.channel !== 'whatsapp') throw new Error('template inválido');
  if (!tpl.waTemplateName) {
    throw new Error('template sem Content SID (HX…) — disparo frio exige template aprovado pela Meta');
  }

  let audienceId: number;
  let projectId: number;

  if (mode === 'audience') {
    audienceId = Number(formData.get('audienceId'));
    if (!audienceId) throw new Error('escolha uma audiência');
    const [aud] = await db.select().from(audiences).where(eq(audiences.id, audienceId)).limit(1);
    if (!aud) throw new Error('audiência não encontrada');
    projectId = aud.projectId;
  } else {
    projectId = Number(formData.get('projectId'));
    const newProject = String(formData.get('newProject') ?? '').trim();
    if (!projectId && newProject) {
      // Campanha de coisa nova: cria o projeto na hora, sem sair do wizard.
      projectId = await createProjectInline(newProject, user.id);
    } else if (projectId) {
      const [proj] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!proj) throw new Error('projeto inválido');
    } else {
      throw new Error('escolha um projeto ou dê nome a um novo');
    }

    let where: SQL;
    let sourceMeta: Record<string, unknown>;
    if (mode === 'paste') {
      const raw = String(formData.get('list') ?? '');
      const parsed = parsePastedList(raw);
      const cond = pastedConditions(parsed);
      if (!cond) throw new Error('lista vazia — cole e-mails ou telefones (um por linha)');
      where = and(eq(contacts.status, 'active'), hasPhone(), cond)!;
      sourceMeta = { mode, tokens: parsed.tokens.length, createdBy: user.id };
    } else {
      const filters: WaWizardFilters = {
        q: strOrUndef(formData.get('q')),
        source: strOrUndef(formData.get('source')),
        uf: strOrUndef(formData.get('uf')),
        role: strOrUndef(formData.get('role')),
      };
      where = and(...filterConditions(filters), hasPhone())!;
      sourceMeta = { mode, filters, createdBy: user.id };
    }

    const matched = await db.select({ id: contacts.id }).from(contacts).where(where);
    if (matched.length === 0) throw new Error('nenhum contato com telefone no recorte escolhido');

    const [aud] = await db
      .insert(audiences)
      .values({
        projectId,
        name: `WA · ${name}`,
        source: 'crm_segment',
        sourceMeta: { ...sourceMeta, createdAt: new Date().toISOString() },
      })
      .returning({ id: audiences.id });
    audienceId = aud.id;

    const CHUNK = 500;
    for (let i = 0; i < matched.length; i += CHUNK) {
      const chunk = matched.slice(i, i + CHUNK);
      await db
        .insert(listMembers)
        .values(chunk.map((m) => ({ audienceId, contactId: m.id })))
        .onConflictDoNothing({ target: [listMembers.audienceId, listMembers.contactId] });
    }
    await db
      .update(audiences)
      .set({ contactCount: matched.length })
      .where(eq(audiences.id, audienceId));
  }

  const [{ contactCount }] = await db
    .select({ contactCount: audiences.contactCount })
    .from(audiences)
    .where(eq(audiences.id, audienceId));

  const [created] = await db
    .insert(campaigns)
    .values({
      projectId,
      audienceId,
      templateId,
      name,
      provider: 'twilio',
      ratePerMinute,
      totalRecipients: contactCount,
      status: 'draft',
      createdBy: user.id,
    })
    .returning({ id: campaigns.id });

  revalidatePath(`/marketing/${projectId}`);
  revalidatePath(`/marketing/${projectId}/campaigns`);
  redirect(`/marketing/${projectId}/campaigns/${created.id}`);
}

function strOrUndef(v: FormDataEntryValue | null): string | undefined {
  const s = (v == null ? '' : String(v)).trim();
  return s || undefined;
}

// Cria um projeto direto do wizard (campanha de assunto novo). Slug único:
// tenta o slug do nome e, em colisão, sufixa -2, -3…
async function createProjectInline(name: string, userId: string): Promise<number> {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'projeto';
  for (let i = 0; i < 10; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [created] = await db
      .insert(projects)
      .values({ name, slug, status: 'active', createdBy: userId })
      .onConflictDoNothing({ target: projects.slug })
      .returning({ id: projects.id });
    if (created) return created.id;
  }
  throw new Error(`não consegui gerar um slug único para o projeto "${name}"`);
}

// ─── Prévia detalhada (painel de revisão) ───────────────────────────────────
// Além das contagens: amostra de quem entra e cobertura das variáveis do
// template — quantos contatos ficariam com {{n}} vazio no launch.

export type WaPreviewDetailed = {
  matched: number;
  withPhone: number;
  tokens?: number;
  sample: Array<{
    name: string | null;
    municipio: string | null;
    uf: string | null;
    phone: string | null;
    attributes: Record<string, unknown>;
  }>;
  varCoverage: Array<{ variable: string; missing: number }>;
};

// Como cada variável resolve no launch (espelha o mergeVars do send-pipeline):
// campos canônicos do contato ou attributes->>'var'.
function varSqlExpr(v: string): SQL {
  if (v === 'nome') return sql`coalesce(${contacts.name}, ${contacts.attributes}->>'nome')`;
  if (v === 'municipio') return sql`${contacts.municipio}`;
  if (v === 'uf') return sql`${contacts.uf}`;
  if (v === 'email') return sql`${contacts.email}`;
  if (v === 'ibge') return sql`${contacts.ibge}`;
  if (v === 'link_inscricao') return sql`'computed'`; // gerado no launch, nunca falta
  return sql`${contacts.attributes}->>${v}`;
}

export async function previewWaDetailed(input: {
  mode: WaPublicMode;
  filters?: WaWizardFilters;
  audienceId?: number;
  list?: string;
  templateId?: number;
}): Promise<WaPreviewDetailed | null> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  let tokens: number | undefined;
  let whereCond: SQL | undefined;
  if (input.mode === 'paste') {
    const parsed = parsePastedList(input.list ?? '');
    tokens = parsed.tokens.length;
    const cond = pastedConditions(parsed);
    if (!cond) return { matched: 0, withPhone: 0, tokens, sample: [], varCoverage: [] };
    whereCond = and(eq(contacts.status, 'active'), cond)!;
  } else if (input.mode === 'filters') {
    whereCond = and(...filterConditions(input.filters ?? {}))!;
  } else if (!input.audienceId) {
    return null;
  }

  let tplVars: string[] = [];
  if (input.templateId) {
    const [tpl] = await db
      .select({ variables: templates.variables })
      .from(templates)
      .where(eq(templates.id, input.templateId))
      .limit(1);
    tplVars = tpl?.variables ?? [];
  }

  const countSel: Record<string, SQL<number>> = {
    matched: sql<number>`count(*)::int`,
    withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.whatsapp} IS NOT NULL OR ${contacts.phone} IS NOT NULL)::int`,
  };
  for (const [i, v] of tplVars.entries()) {
    const e = varSqlExpr(v);
    countSel[`miss_${i}`] = sql<number>`count(*) FILTER (WHERE (${contacts.whatsapp} IS NOT NULL OR ${contacts.phone} IS NOT NULL) AND ((${e}) IS NULL OR (${e})::text = ''))::int`;
  }

  const sampleSel = {
    name: contacts.name,
    municipio: contacts.municipio,
    uf: contacts.uf,
    phone: sql<string | null>`coalesce(${contacts.whatsapp}, ${contacts.phone})`,
    attributes: contacts.attributes,
  };

  let countRow: Record<string, number> | undefined;
  let sampleRows: Array<{
    name: string | null;
    municipio: string | null;
    uf: string | null;
    phone: string | null;
    attributes: unknown;
  }>;
  if (input.mode === 'audience') {
    const base = and(
      eq(listMembers.audienceId, input.audienceId!),
      eq(contacts.status, 'active'),
    )!;
    [countRow] = await db
      .select(countSel)
      .from(listMembers)
      .innerJoin(contacts, eq(listMembers.contactId, contacts.id))
      .where(base);
    sampleRows = await db
      .select(sampleSel)
      .from(listMembers)
      .innerJoin(contacts, eq(listMembers.contactId, contacts.id))
      .where(and(base, hasPhone()))
      .limit(8);
  } else {
    [countRow] = await db.select(countSel).from(contacts).where(whereCond!);
    sampleRows = await db
      .select(sampleSel)
      .from(contacts)
      .where(and(whereCond!, hasPhone()))
      .limit(8);
  }

  return {
    matched: countRow?.matched ?? 0,
    withPhone: countRow?.withPhone ?? 0,
    tokens,
    sample: sampleRows.map((r) => ({
      ...r,
      attributes: (r.attributes ?? {}) as Record<string, unknown>,
    })),
    varCoverage: tplVars.map((v, i) => ({ variable: v, missing: countRow?.[`miss_${i}`] ?? 0 })),
  };
}
