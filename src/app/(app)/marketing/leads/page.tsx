import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import {
  getLeadsHubData,
  listProjectsForLeads,
} from '@/lib/actions/marketing/leads';
import {
  type Facet,
  type LeadFilters,
  roleLabel,
} from '@/lib/actions/marketing/leads-types';
import { Icon } from '@/components/marketing-hub';
import { CreateAudiencePopover } from '@/components/marketing/create-audience-popover';
import { LeadsTable } from '@/components/marketing/leads-table';

export const dynamic = 'force-dynamic';

// ── helpers de URL: monta query strings preservando/alternando filtros ──────
type RawSearch = {
  q?: string;
  source?: string;
  uf?: string;
  role?: string;
  status?: string;
  audienceId?: string;
  page?: string;
};

function toFilters(sp: RawSearch): LeadFilters {
  return {
    q: sp.q?.trim() || undefined,
    source: sp.source || undefined,
    uf: sp.uf || undefined,
    role: sp.role || undefined,
    status: sp.status || undefined,
    audienceId: sp.audienceId ? Number(sp.audienceId) : undefined,
    page: sp.page ? Math.max(0, Number(sp.page)) : 0,
  };
}

// Constrói /marketing/leads?... a partir de um objeto de overrides. Strings
// vazias removem a chave. `page` sempre reseta a 0 ao mudar um filtro (exceto
// quando explicitamente passada).
function buildHref(base: RawSearch, overrides: Partial<RawSearch>): string {
  const merged: Record<string, string | undefined> = { ...base, ...overrides };
  if (!('page' in overrides)) delete merged.page; // mudar filtro = voltar p/ página 0
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/marketing/leads?${qs}` : '/marketing/leads';
}

export default async function LeadsHubPage({
  searchParams,
}: {
  searchParams: Promise<RawSearch>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const sp = await searchParams;
  const filters = toFilters(sp);

  const [data, projectsList] = await Promise.all([
    getLeadsHubData(filters),
    listProjectsForLeads(),
  ]);

  const { kpis, rows, total, page, pageSize, facets, audiencesList } = data;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const hasPrev = page > 0;
  const hasNext = to < total;

  const activeFilterCount = [
    filters.q,
    filters.source,
    filters.uf,
    filters.role,
    filters.status,
    filters.audienceId,
  ].filter(Boolean).length;

  const kpiCards = [
    { label: 'Total de contatos', value: kpis.total },
    { label: 'Com WhatsApp/telefone', value: kpis.withPhone },
    { label: 'Com e-mail', value: kpis.withEmail },
    { label: 'Novos (7 dias)', value: kpis.recent },
    { label: 'Fontes distintas', value: kpis.sources },
  ];

  // Snapshot dos filtros ativos (sem page) p/ a ação criar-audiência.
  const filterSnapshot = {
    q: sp.q ?? '',
    source: sp.source ?? '',
    uf: sp.uf ?? '',
    role: sp.role ?? '',
    status: sp.status ?? '',
    audienceId: sp.audienceId ?? '',
  };

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <Link href="/marketing" className="text-xs text-slate-500 hover:text-slate-700">
          ← Marketing
        </Link>
        <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Leads Hub
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Base única de contatos — filtre, segmente e crie audiências para campanhas.
        </p>
      </header>

      {/* ── KPIs ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--i10-navy)' }}>
              {k.value.toLocaleString('pt-BR')}
            </div>
            <div className="mt-1 text-xs text-slate-500">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
        {/* ── Filtros (esquerda) ── */}
        <aside className="space-y-5">
          <form action="/marketing/leads" method="get" className="flex gap-2">
            {/* preserva filtros não-busca ao submeter a busca */}
            {filters.source && <input type="hidden" name="source" value={filters.source} />}
            {filters.uf && <input type="hidden" name="uf" value={filters.uf} />}
            {filters.role && <input type="hidden" name="role" value={filters.role} />}
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            {filters.audienceId && (
              <input type="hidden" name="audienceId" value={String(filters.audienceId)} />
            )}
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Buscar nome, e-mail, telefone…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-i10-700 px-3 py-2 text-sm font-medium text-white hover:bg-i10-800"
            >
              <Icon name="search" size={16} />
            </button>
          </form>

          {activeFilterCount > 0 && (
            <Link
              href="/marketing/leads"
              className="inline-block text-xs font-medium text-cyan-700 hover:underline"
            >
              Limpar filtros ({activeFilterCount})
            </Link>
          )}

          <FacetGroup title="Fonte" facets={facets.source} field="source" sp={sp} active={filters.source} />
          <FacetGroup title="UF" facets={facets.uf} field="uf" sp={sp} active={filters.uf} />
          <FacetGroup
            title="Papel"
            facets={facets.role}
            field="role"
            sp={sp}
            active={filters.role}
            labelFn={roleLabel}
          />
          <FacetGroup title="Status" facets={facets.status} field="status" sp={sp} active={filters.status} />

          {/* Filtro por lista (audiência) */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Lista</h3>
            <div className="space-y-1">
              {audiencesList.map((a) => {
                const isActive = filters.audienceId === a.id;
                return (
                  <Link
                    key={a.id}
                    href={buildHref(sp, { audienceId: isActive ? '' : String(a.id) })}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                      isActive ? 'bg-cyan-50 font-semibold text-cyan-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-slate-400">{a.contactCount}</span>
                  </Link>
                );
              })}
              {audiencesList.length === 0 && (
                <p className="text-xs text-slate-400">Nenhuma audiência ainda.</p>
              )}
            </div>
          </div>
        </aside>

        {/* ── Tabela (direita) ── */}
        <section className="min-w-0">
          {/* Barra de ação: criar audiência com o filtro atual */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              {total.toLocaleString('pt-BR')} contato{total === 1 ? '' : 's'} no recorte atual
            </div>
            <CreateAudiencePopover
              projectsList={projectsList}
              filterSnapshot={filterSnapshot}
              total={total}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <LeadsTable rows={rows} />

            {/* Footer: paginação preservando filtros */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <div className="text-slate-500">
                Mostrando {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de{' '}
                {total.toLocaleString('pt-BR')}
              </div>
              <div className="flex gap-2">
                <PagerLink sp={sp} page={page - 1} disabled={!hasPrev} label="Anterior" />
                <PagerLink sp={sp} page={page + 1} disabled={!hasNext} label="Próximo" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FacetGroup({
  title,
  facets,
  field,
  sp,
  active,
  labelFn,
}: {
  title: string;
  facets: Facet[];
  field: keyof RawSearch;
  sp: RawSearch;
  active: string | number | undefined;
  labelFn?: (v: string) => string;
}) {
  if (facets.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="space-y-1">
        {facets.map((f) => {
          const isActive = String(active ?? '') === f.value;
          return (
            <Link
              key={f.value}
              href={buildHref(sp, { [field]: isActive ? '' : f.value })}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                isActive
                  ? 'bg-cyan-50 font-semibold text-cyan-800'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{labelFn ? labelFn(f.value) : f.value}</span>
              <span className="ml-2 shrink-0 text-xs text-slate-400">{f.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PagerLink({
  sp,
  page,
  disabled,
  label,
}: {
  sp: RawSearch;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={buildHref(sp, { page: String(page) })}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}
