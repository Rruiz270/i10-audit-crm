import { and, desc, eq, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, opportunities, fundebMunicipalities } from '@/lib/schema';
import { requireUser } from '@/lib/session';

// ─── Contatos (operacional) — camada de dados paginada/facetada ─────────────
// Contatos vivem por-oportunidade (crm.contacts). A página adota o shell do
// Leads Hub: KPIs globais + facetas escopadas + busca parametrizada (ILIKE) +
// LIMIT/OFFSET (substitui o teto fixo de 500 linhas, sem busca). Módulo de
// leitura (não 'use server') — importado por server component.

export const CONTACTS_PAGE_SIZE = 50;

export type ContactFilters = {
  q?: string;
  role?: string;
  uf?: string;
  has?: string; // 'email' | 'whatsapp'
  page?: number;
};

// WHERE a partir dos filtros; `exclude` omite um campo (faceted-search clássico).
function buildContactConditions(f: ContactFilters, exclude?: keyof ContactFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.q && exclude !== 'q') {
    const term = `%${f.q.trim()}%`;
    const c = or(
      ilike(contacts.name, term),
      ilike(contacts.email, term),
      ilike(contacts.phone, term),
      ilike(contacts.whatsapp, term),
    );
    if (c) conds.push(c);
  }
  if (f.role && exclude !== 'role') conds.push(eq(contacts.role, f.role));
  if (f.uf && exclude !== 'uf') conds.push(eq(fundebMunicipalities.uf, f.uf));
  if (f.has && exclude !== 'has') {
    if (f.has === 'email') conds.push(isNotNull(contacts.email));
    else if (f.has === 'whatsapp') {
      const c = or(isNotNull(contacts.whatsapp), isNotNull(contacts.phone));
      if (c) conds.push(c);
    }
  }
  return conds;
}

function contactFacet(col: SQL, conds: SQL[]) {
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select({ value: sql<string | null>`${col}`, count: sql<number>`count(*)::int` })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(where)
    .groupBy(sql`${col}`)
    .orderBy(sql`count(*) desc`)
    .limit(30);
}

export async function getContactsHubData(f: ContactFilters) {
  await requireUser();
  const page = Math.max(0, f.page ?? 0);

  // KPIs globais (north-star da base).
  const [kpiRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withEmail: sql<number>`count(*) FILTER (WHERE ${contacts.email} IS NOT NULL)::int`,
      withPhone: sql<number>`count(*) FILTER (WHERE ${contacts.whatsapp} IS NOT NULL OR ${contacts.phone} IS NOT NULL)::int`,
      primary: sql<number>`count(*) FILTER (WHERE ${contacts.isPrimary})::int`,
    })
    .from(contacts);

  const [muniRow] = await db
    .select({ n: sql<number>`count(DISTINCT ${opportunities.municipalityId})::int` })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id));

  const tableConds = buildContactConditions(f);
  const tableWhere = tableConds.length ? and(...tableConds) : undefined;

  const rowsPromise = db
    .select({
      id: contacts.id,
      name: contacts.name,
      role: contacts.role,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      isPrimary: contacts.isPrimary,
      opportunityId: contacts.opportunityId,
      municipalityName: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
    })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(tableWhere)
    .orderBy(desc(contacts.createdAt))
    .limit(CONTACTS_PAGE_SIZE)
    .offset(page * CONTACTS_PAGE_SIZE);

  const totalPromise = db
    .select({ n: sql<number>`count(*)::int` })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(tableWhere);

  const [rows, [totalRow], roleFacets, ufFacets] = await Promise.all([
    rowsPromise,
    totalPromise,
    contactFacet(contacts.role as unknown as SQL, buildContactConditions(f, 'role')),
    contactFacet(fundebMunicipalities.uf as unknown as SQL, buildContactConditions(f, 'uf')),
  ]);

  const clean = (rs: { value: string | null; count: number }[]) =>
    rs
      .filter((r) => r.value != null && r.value !== '')
      .map((r) => ({ value: String(r.value), count: Number(r.count) }));

  return {
    kpis: {
      total: Number(kpiRow?.total ?? 0),
      withEmail: Number(kpiRow?.withEmail ?? 0),
      withPhone: Number(kpiRow?.withPhone ?? 0),
      primary: Number(kpiRow?.primary ?? 0),
      municipalities: Number(muniRow?.n ?? 0),
    },
    rows,
    total: Number(totalRow?.n ?? 0),
    page,
    pageSize: CONTACTS_PAGE_SIZE,
    facets: { role: clean(roleFacets), uf: clean(ufFacets) },
  };
}
