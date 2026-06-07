import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Chip } from '@/components/ui/chip';
import { FacetGroup } from '@/components/ui/facet-group';
import {
  getContactsHubData,
  type ContactFilters,
} from '@/lib/queries/contacts';

export const dynamic = 'force-dynamic';

type RawSearch = {
  q?: string;
  role?: string;
  uf?: string;
  has?: string;
  page?: string;
};

function toFilters(sp: RawSearch): ContactFilters {
  return {
    q: sp.q?.trim() || undefined,
    role: sp.role || undefined,
    uf: sp.uf || undefined,
    has: sp.has || undefined,
    page: sp.page ? Math.max(0, Number(sp.page)) : 0,
  };
}

// Monta /contacts?... a partir de overrides. Strings vazias removem a chave;
// mudar um filtro reseta a paginação (page 0).
function buildHref(base: RawSearch, overrides: Partial<RawSearch>): string {
  const merged: Record<string, string | undefined> = { ...base, ...overrides };
  if (!('page' in overrides)) delete merged.page;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/contacts?${qs}` : '/contacts';
}

// Telefone só dígitos para wa.me / tel:
function digits(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearch>;
}) {
  const sp = await searchParams;
  const filters = toFilters(sp);
  const data = await getContactsHubData(filters);

  const { kpis, rows, total, page, pageSize, facets } = data;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const hasPrev = page > 0;
  const hasNext = to < total;

  const activeFilterCount = [filters.q, filters.role, filters.uf, filters.has].filter(
    Boolean,
  ).length;

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
          Operação
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Contatos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Base de contatos das oportunidades — filtre, busque e fale direto.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile icon="users" tone="navy" value={kpis.total.toLocaleString('pt-BR')} label="Total" />
        <KpiTile icon="mail" tone="cyan" value={kpis.withEmail.toLocaleString('pt-BR')} label="Com e-mail" />
        <KpiTile icon="msg" tone="mint" value={kpis.withPhone.toLocaleString('pt-BR')} label="Com WhatsApp/telefone" />
        <KpiTile icon="flag" tone="violet" value={kpis.primary.toLocaleString('pt-BR')} label="Principais" />
        <KpiTile icon="layers" tone="slate" value={kpis.municipalities.toLocaleString('pt-BR')} label="Municípios" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <form action="/contacts" method="get" className="flex gap-2">
            {filters.role && <input type="hidden" name="role" value={filters.role} />}
            {filters.uf && <input type="hidden" name="uf" value={filters.uf} />}
            {filters.has && <input type="hidden" name="has" value={filters.has} />}
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Buscar nome, e-mail, telefone…"
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
            <Link
              href="/contacts"
              className="inline-block text-xs font-medium text-cyan-700 hover:underline"
            >
              Limpar filtros ({activeFilterCount})
            </Link>
          )}

          <FacetGroup
            title="Cargo"
            facets={facets.role}
            active={filters.role}
            buildHref={(value, isActive) => buildHref(sp, { role: isActive ? '' : value })}
          />
          <FacetGroup
            title="UF"
            facets={facets.uf}
            active={filters.uf}
            buildHref={(value, isActive) => buildHref(sp, { uf: isActive ? '' : value })}
          />

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Canais</h3>
            <div className="space-y-1">
              {[
                { value: 'email', label: 'Tem e-mail' },
                { value: 'whatsapp', label: 'Tem WhatsApp/telefone' },
              ].map((opt) => {
                const isActive = filters.has === opt.value;
                return (
                  <Link
                    key={opt.value}
                    href={buildHref(sp, { has: isActive ? '' : opt.value })}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                      isActive
                        ? 'bg-cyan-50 font-semibold text-cyan-800'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 text-sm text-slate-500">
            {total.toLocaleString('pt-BR')} contato{total === 1 ? '' : 's'} no recorte atual
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Município/UF</th>
                  <th className="px-4 py-3">Cargo</th>
                  <th className="px-4 py-3">Canais</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const wa = digits(c.whatsapp) || digits(c.phone);
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/opportunities/${c.opportunityId}`}
                            className="font-medium text-slate-900 hover:text-i10-700 hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.isPrimary && <Chip tone="mint">principal</Chip>}
                        </div>
                        {c.role && <div className="text-xs text-slate-400">{c.role}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.municipalityName
                          ? `${c.municipalityName}${c.uf ? `/${c.uf}` : ''}`
                          : c.uf ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.role ? <Chip tone="violet">{c.role}</Chip> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 text-slate-300">
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="text-sky-600 hover:text-sky-700" title={c.email}>
                              <Icon name="mail" size={16} />
                            </a>
                          ) : (
                            <span title="Sem e-mail">
                              <Icon name="mail" size={16} />
                            </span>
                          )}
                          {c.phone ? (
                            <a href={`tel:${digits(c.phone)}`} className="text-slate-600 hover:text-slate-800" title={c.phone}>
                              <Icon name="phone" size={16} />
                            </a>
                          ) : (
                            <span title="Sem telefone">
                              <Icon name="phone" size={16} />
                            </span>
                          )}
                          {wa ? (
                            <a
                              href={`https://wa.me/${wa}`}
                              target="_blank"
                              rel="noopener"
                              className="text-emerald-600 hover:text-emerald-700"
                              title="WhatsApp"
                            >
                              <Icon name="msg" size={16} />
                            </a>
                          ) : (
                            <span title="Sem WhatsApp">
                              <Icon name="msg" size={16} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                      Nenhum contato encontrado com esse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

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
}
