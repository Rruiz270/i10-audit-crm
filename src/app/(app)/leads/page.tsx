import Link from 'next/link';
import { and, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leadForms, leadSubmissions, opportunities } from '@/lib/schema';
import { prospectSnapshotsByMunicipality } from '@/lib/prospecting';
import { KpiTile } from '@/components/ui/kpi-tile';
import { FacetGroup } from '@/components/ui/facet-group';
import { Icon } from '@/components/ui/icon';
import { LeadSubmissionCard, type LeadCard } from '@/components/lead-submission-card';

export const dynamic = 'force-dynamic';

type RawSearch = {
  q?: string;
  status?: string; // 'pendente' | 'triado'
  formId?: string;
};

function buildHref(base: RawSearch, overrides: Partial<RawSearch>): string {
  const merged: Record<string, string | undefined> = { ...base, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/leads?${qs}` : '/leads';
}

// Parsing apresentacional do payload (chaves variam por formulário).
function parseCard(payload: unknown): {
  name: string;
  local: string | null;
  role: string | null;
  entries: [string, string][];
} {
  if (!payload || typeof payload !== 'object') {
    return { name: '—', local: null, role: null, entries: [] };
  }
  const obj = payload as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  // Alguns formulários (ex: APM) aninham o lead em contacts[0] e usam
  // municipalityName — não as chaves de topo. Olhamos os dois lugares.
  const firstContact =
    Array.isArray(obj.contacts) && obj.contacts[0] && typeof obj.contacts[0] === 'object'
      ? (obj.contacts[0] as Record<string, unknown>)
      : null;
  const fromContact = (...keys: string[]) => {
    for (const k of keys) {
      const v = firstContact?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  const name =
    pick('name', 'nome', 'contact_name', 'responsavel') ?? fromContact('name', 'nome') ?? '(sem nome)';
  const municipio = pick('municipio', 'município', 'cidade', 'municipality', 'municipalityName', 'city');
  const uf = pick('uf', 'estado', 'state');
  const local = municipio ? `${municipio}${uf ? `/${uf}` : ''}` : uf;
  const role = pick('role', 'cargo', 'funcao', 'função') ?? fromContact('role', 'cargo');

  // "Ver dados": achata o primeiro contato e ignora objetos crus (evita
  // "[object Object]" pra arrays/objetos como `contacts`).
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || (typeof v === 'string' && !v.trim())) continue;
    if (k === 'contacts' && firstContact) {
      for (const [ck, cv] of Object.entries(firstContact)) {
        if (cv != null && String(cv).trim()) entries.push([`contato · ${ck}`, String(cv)]);
      }
      continue;
    }
    if (typeof v === 'object') continue;
    entries.push([k, String(v)]);
  }
  return { name, local, role, entries };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearch>;
}) {
  const sp = await searchParams;
  const status = sp.status === 'triado' ? 'triado' : sp.status === 'pendente' ? 'pendente' : undefined;
  const formId = sp.formId ? Number(sp.formId) : undefined;
  const q = sp.q?.trim() || undefined;

  const since30 = new Date(new Date().getTime() - 30 * 24 * 3600 * 1000);

  // ── Filtros (parametrizados) ──
  const conds: SQL[] = [];
  if (status === 'pendente') conds.push(eq(leadSubmissions.triaged, false));
  if (status === 'triado') conds.push(eq(leadSubmissions.triaged, true));
  if (formId) conds.push(eq(leadSubmissions.formId, formId));
  if (q) {
    // busca no payload serializado (texto) — parametrizada via bind do drizzle.
    const term = `%${q}%`;
    const c = ilike(sql`${leadSubmissions.payload}::text`, term);
    if (c) conds.push(c);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [forms, submissions, kpiRow, formFacetRows] = await Promise.all([
    db.select().from(leadForms).orderBy(desc(leadForms.createdAt)),
    db
      .select({
        id: leadSubmissions.id,
        formId: leadSubmissions.formId,
        formTitle: leadForms.title,
        payload: leadSubmissions.payload,
        submittedAt: leadSubmissions.submittedAt,
        triaged: leadSubmissions.triaged,
        opportunityId: leadSubmissions.opportunityId,
      })
      .from(leadSubmissions)
      .leftJoin(leadForms, eq(leadSubmissions.formId, leadForms.id))
      .where(where)
      .orderBy(desc(leadSubmissions.submittedAt))
      .limit(200),
    db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${leadSubmissions.triaged} = false)::int`,
        triaged30: sql<number>`count(*) FILTER (WHERE ${leadSubmissions.triaged} = true AND ${leadSubmissions.triagedAt} >= ${since30})::int`,
        converted: sql<number>`count(*) FILTER (WHERE ${leadSubmissions.opportunityId} IS NOT NULL)::int`,
      })
      .from(leadSubmissions),
    db
      .select({ formId: leadSubmissions.formId, count: sql<number>`count(*)::int` })
      .from(leadSubmissions)
      .groupBy(leadSubmissions.formId),
  ]);

  const total = Number(kpiRow[0]?.total ?? 0);
  const pending = Number(kpiRow[0]?.pending ?? 0);
  const triaged30 = Number(kpiRow[0]?.triaged30 ?? 0);
  const converted = Number(kpiRow[0]?.converted ?? 0);
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0;
  const activeForms = forms.filter((f) => f.isActive).length;

  const formTitleById = new Map(forms.map((f) => [f.id, f.title]));
  const formFacets = formFacetRows
    .filter((r) => r.formId != null)
    .map((r) => ({ value: String(r.formId), count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);

  const statusFacets = [
    { value: 'pendente', count: pending },
    { value: 'triado', count: total - pending },
  ];

  const activeFilterCount = [q, status, formId].filter((v) => v != null && v !== '').length;

  // Score de potencial FUNDEB do município do lead (via oportunidade criada
  // no intake) — prioriza a triagem. Resiliente: sem dados, sem badge.
  const prospectByOpp: Record<number, { score: number; valorEstimado: number | null }> = {};
  try {
    const oppIds = submissions
      .map((s) => s.opportunityId)
      .filter((id): id is number => id != null);
    if (oppIds.length) {
      const opps = await db
        .select({ id: opportunities.id, municipalityId: opportunities.municipalityId })
        .from(opportunities)
        .where(inArray(opportunities.id, oppIds));
      const snapshots = await prospectSnapshotsByMunicipality(
        opps.map((o) => o.municipalityId).filter((id): id is number => id != null),
      );
      for (const o of opps) {
        if (o.municipalityId != null && snapshots[o.municipalityId]) {
          prospectByOpp[o.id] = snapshots[o.municipalityId];
        }
      }
    }
  } catch {
    // dados de prospecção são opcionais — não pode derrubar a triagem
  }

  const cards: LeadCard[] = submissions.map((s) => {
    const parsed = parseCard(s.payload);
    return {
      id: s.id,
      formId: s.formId,
      formTitle: s.formTitle,
      submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : null,
      triaged: !!s.triaged,
      opportunityId: s.opportunityId,
      prospect: s.opportunityId != null ? (prospectByOpp[s.opportunityId] ?? null) : null,
      ...parsed,
    };
  });

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
          Operação
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Leads (entrada pública)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submissões dos formulários públicos — triar e acompanhar conversão.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon="inbox"
          tone="amber"
          value={pending}
          label="Pendentes"
          badge={pending > 0 ? { text: 'triar', tone: 'amber' } : undefined}
        />
        <KpiTile icon="check" tone="mint" value={triaged30} label="Triados (30d)" />
        <KpiTile icon="activity" tone="cyan" value={`${convRate}%`} label="Taxa conversão" />
        <KpiTile icon="file" tone="navy" value={activeForms} label="Formulários ativos" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5">
          <form action="/leads" method="get" className="flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            {formId && <input type="hidden" name="formId" value={String(formId)} />}
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Buscar nos dados…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="rounded-md bg-i10-700 px-3 py-2 text-sm font-medium text-white hover:bg-i10-800"
            >
              <Icon name="search" size={16} />
            </button>
          </form>

          {activeFilterCount > 0 && (
            <Link href="/leads" className="inline-block text-xs font-medium text-cyan-700 hover:underline">
              Limpar filtros ({activeFilterCount})
            </Link>
          )}

          <FacetGroup
            title="Status"
            facets={statusFacets}
            active={status}
            buildHref={(value, isActive) => buildHref(sp, { status: isActive ? '' : value })}
            labelFn={(v) => (v === 'pendente' ? 'Pendente' : 'Triado')}
          />
          <FacetGroup
            title="Formulário"
            facets={formFacets}
            active={formId != null ? String(formId) : undefined}
            buildHref={(value, isActive) => buildHref(sp, { formId: isActive ? '' : value })}
            labelFn={(v) => formTitleById.get(Number(v)) ?? `#${v}`}
          />
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="text-sm text-slate-500">
            {cards.length.toLocaleString('pt-BR')} submissõe{cards.length === 1 ? '' : 's'} no recorte atual
          </div>
          {cards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm italic text-slate-500">
              Nenhuma submissão com esse filtro.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {cards.map((s) => (
                <LeadSubmissionCard key={s.id} s={s} />
              ))}
            </div>
          )}

          {/* Gestão de formulários — recolhida (HubTile-style links) */}
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
              Formulários <span className="font-normal text-slate-400">({forms.length})</span>
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-i10-navy-pale text-i10-navy">
                      <Icon name="file" size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{f.title}</div>
                      <div className="truncate text-xs text-slate-500">{f.description}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Link
                      href={`/intake/${f.slug}`}
                      target="_blank"
                      className="text-xs font-medium text-cyan-700 hover:underline"
                    >
                      /intake/{f.slug} →
                    </Link>
                    <span className={`text-xs ${f.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {f.isActive ? 'ativo' : 'inativo'}
                    </span>
                  </div>
                </div>
              ))}
              {forms.length === 0 && (
                <div className="col-span-full text-xs italic text-slate-500">
                  Rode <code className="bg-slate-100 px-1">npm run seed</code> para criar o formulário padrão.
                </div>
              )}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
