'use server';

import { and, asc, desc, eq, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audiences, contacts, listMembers, projects } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import {
  PAGE_SIZE,
  type Facet,
  type LeadFilters,
  type LeadsHubData,
} from './leads-types';

// ─── Leads Hub — camada de dados (server-side, paginada, indexada) ──────────
// Todas as listas/contagens assumem 16k+ contatos: nada carrega a base inteira
// em memória. Tabela = LIMIT/OFFSET; facetas = GROUP BY (servido por índices em
// source/uf/role/status); KPIs = COUNTs agregados num único SELECT.

// Constrói a lista de condições WHERE a partir dos filtros. `exclude` permite
// omitir um filtro (usado pelas facetas pra contar "as outras opções" sem se
// auto-zerar). audienceId vira um EXISTS subquery (indexado por list_members).
function buildConditions(f: LeadFilters, exclude?: keyof LeadFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.q && exclude !== 'q') {
    const term = `%${f.q.trim()}%`;
    const c = or(
      ilike(contacts.name, term),
      ilike(contacts.email, term),
      ilike(contacts.phone, term),
    );
    if (c) conds.push(c);
  }
  if (f.source && exclude !== 'source') conds.push(eq(contacts.source, f.source));
  if (f.uf && exclude !== 'uf') conds.push(eq(contacts.uf, f.uf));
  if (f.role && exclude !== 'role') conds.push(eq(contacts.role, f.role));
  if (f.status && exclude !== 'status') conds.push(eq(contacts.status, f.status));
  if (f.audienceId && exclude !== 'audienceId') {
    conds.push(
      sql`EXISTS (SELECT 1 FROM marketing.list_members lm WHERE lm.contact_id = ${contacts.id} AND lm.audience_id = ${f.audienceId})`,
    );
  }
  return conds;
}

// Decisão (v1): KPIs são GLOBAIS (toda a base) — são um "north star" da base, não
// do recorte atual. Já as facetas e a tabela respeitam os filtros ativos. Cada
// faceta exclui seu próprio campo do WHERE (clássico faceted-search) pra que
// trocar de valor dentro do mesmo grupo não zere as outras opções.
export async function getLeadsHubData(f: LeadFilters): Promise<LeadsHubData> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const page = Math.max(0, f.page ?? 0);

  // KPIs — uma única passada agregada sobre a base inteira.
  const [kpiRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.phone} IS NOT NULL OR ${contacts.whatsapp} IS NOT NULL)::int`,
      withEmail: sql<number>`count(*) FILTER (WHERE ${contacts.email} IS NOT NULL)::int`,
      recent: sql<number>`count(*) FILTER (WHERE ${contacts.createdAt} >= now() - interval '7 days')::int`,
      sources: sql<number>`count(DISTINCT ${contacts.source})::int`,
    })
    .from(contacts);

  // Tabela paginada + total do recorte.
  const tableConds = buildConditions(f);
  const tableWhere = tableConds.length ? and(...tableConds) : undefined;

  const rowsPromise = db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      municipio: contacts.municipio,
      uf: contacts.uf,
      role: contacts.role,
      source: contacts.source,
      status: contacts.status,
      partido: sql<string | null>`${contacts.attributes}->>'partido'`,
    })
    .from(contacts)
    .where(tableWhere)
    .orderBy(desc(contacts.createdAt), desc(contacts.id))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const totalPromise = db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(tableWhere);

  // Facetas: GROUP BY escopado às OUTRAS condições ativas.
  const facetSource = facetQuery(contacts.source, buildConditions(f, 'source'));
  const facetUf = facetQuery(contacts.uf, buildConditions(f, 'uf'));
  const facetRole = facetQuery(contacts.role, buildConditions(f, 'role'));
  const facetStatus = facetQuery(contacts.status, buildConditions(f, 'status'));

  const audiencesPromise = db
    .select({
      id: audiences.id,
      name: audiences.name,
      contactCount: audiences.contactCount,
    })
    .from(audiences)
    .orderBy(desc(audiences.createdAt))
    .limit(100);

  const [rows, [totalRow], sourceF, ufF, roleF, statusF, audiencesList] =
    await Promise.all([
      rowsPromise,
      totalPromise,
      facetSource,
      facetUf,
      facetRole,
      facetStatus,
      audiencesPromise,
    ]);

  return {
    kpis: {
      total: kpiRow?.total ?? 0,
      withPhone: kpiRow?.withPhone ?? 0,
      withEmail: kpiRow?.withEmail ?? 0,
      recent: kpiRow?.recent ?? 0,
      sources: kpiRow?.sources ?? 0,
    },
    rows,
    total: totalRow?.n ?? 0,
    page,
    pageSize: PAGE_SIZE,
    facets: { source: sourceF, uf: ufF, role: roleF, status: statusF },
    audiencesList,
  };
}

async function facetQuery(
  col: typeof contacts.source | typeof contacts.uf | typeof contacts.role | typeof contacts.status,
  conds: SQL[],
): Promise<Facet[]> {
  const where = and(isNotNull(col), ...(conds.length ? conds : []));
  const rows = await db
    .select({ value: col, count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(where)
    .groupBy(col)
    .orderBy(desc(sql`count(*)`), asc(col))
    .limit(50);
  return rows
    .filter((r): r is { value: string; count: number } => r.value != null)
    .map((r) => ({ value: r.value, count: r.count }));
}

// ─── Ação: criar audiência a partir do filtro atual (→ campanha) ───────────
// Escala 16k+: seleciona TODOS os ids do recorte (não só a página) e insere os
// list_members em CHUNKS de 500 com onConflictDoNothing. Nada é carregado linha
// a linha. contactCount é setado por COUNT no fim.
export async function createAudienceFromFilter(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const projectId = Number(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  if (!projectId || !name) throw new Error('projectId e name obrigatórios');

  // Valida o projeto (escopo).
  const proj = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj[0]) throw new Error('projeto inválido');

  const filters: LeadFilters = {
    q: strOrUndef(formData.get('q')),
    source: strOrUndef(formData.get('source')),
    uf: strOrUndef(formData.get('uf')),
    role: strOrUndef(formData.get('role')),
    status: strOrUndef(formData.get('status')),
    audienceId: formData.get('audienceId') ? Number(formData.get('audienceId')) : undefined,
  };

  const conds = buildConditions(filters);
  const where = conds.length ? and(...conds) : undefined;

  // Cria a audiência com o snapshot do filtro.
  const [aud] = await db
    .insert(audiences)
    .values({
      projectId,
      name,
      source: 'crm_segment',
      sourceMeta: { filters, createdBy: user.id, createdAt: new Date().toISOString() },
    })
    .returning({ id: audiences.id });

  // Seleciona TODOS os ids do recorte (apenas a coluna id — leve mesmo a 16k+).
  const matched = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(where);

  // Insere list_members em chunks de 500 (idempotente via UNIQUE index).
  const CHUNK = 500;
  for (let i = 0; i < matched.length; i += CHUNK) {
    const chunk = matched.slice(i, i + CHUNK);
    await db
      .insert(listMembers)
      .values(chunk.map((m) => ({ audienceId: aud.id, contactId: m.id })))
      .onConflictDoNothing({ target: [listMembers.audienceId, listMembers.contactId] });
  }

  // contactCount real (defensivo: conta o que de fato entrou).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listMembers)
    .where(eq(listMembers.audienceId, aud.id));
  await db.update(audiences).set({ contactCount: n }).where(eq(audiences.id, aud.id));

  // Leva direto ao wizard de campanha com a audiência pré-selecionada.
  redirect(`/marketing/${projectId}/campaigns/new?audienceId=${aud.id}`);
}

function strOrUndef(v: FormDataEntryValue | null): string | undefined {
  const s = (v == null ? '' : String(v)).trim();
  return s || undefined;
}

// Lista projetos pra escolher onde a audiência será criada (no modal de ação).
export async function listProjectsForLeads(): Promise<
  Array<{ id: number; name: string }>
> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(desc(projects.createdAt));
}
