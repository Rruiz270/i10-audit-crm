import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Chip } from '@/components/ui/chip';
import { FacetGroup } from '@/components/ui/facet-group';
import { getContactsHubData, type ContactFilters } from '@/lib/queries/contacts';

export const dynamic = 'force-dynamic';

type RawSearch = {
  q?: string;
  role?: string;
  uf?: string;
  municipio?: string;
  source?: string;
  seg?: string;
  page?: string;
};

function toFilters(sp: RawSearch): ContactFilters {
  return {
    q: sp.q?.trim() || undefined,
    role: sp.role || undefined,
    uf: sp.uf || undefined,
    municipio: sp.municipio || undefined,
    source: sp.source || undefined,
    seg: sp.seg || undefined,
    page: sp.page ? Math.max(0, Number(sp.page)) : 0,
  };
}

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

function digits(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

function ago(d: Date): string {
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `há ${days}d`;
  return `há ${Math.floor(days / 30)}m`;
}

const WA_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  unk: 'bg-slate-300',
  bad: 'bg-red-500',
};
const WA_TITLE: Record<string, string> = {
  ok: 'WhatsApp validado (entrega confirmada)',
  unk: 'WhatsApp nunca testado',
  bad: 'Sem WhatsApp válido ou suprimido (opt-out/63003)',
};

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

  const activeFilterCount = [
    filters.q,
    filters.role,
    filters.uf,
    filters.municipio,
    filters.source,
    filters.seg,
  ].filter(Boolean).length;

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
          Operação
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Contatos{' '}
          <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 align-middle">
            base única
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Todos os {kpis.total.toLocaleString('pt-BR')} contatos da base (Leads Hub + CRM). Clique
          num contato para abrir a Ficha 360 com o histórico completo de interações.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile icon="users" tone="navy" value={kpis.total.toLocaleString('pt-BR')} label="Total (base única)" />
        <KpiTile icon="msg" tone="mint" value={kpis.waValid.toLocaleString('pt-BR')} label="WhatsApp válido" />
        <KpiTile icon="chart" tone="cyan" value={kpis.interacted.toLocaleString('pt-BR')} label="Com interação" />
        <KpiTile icon="flag" tone="violet" value={kpis.inOpp.toLocaleString('pt-BR')} label="Em oportunidade" />
        <KpiTile icon="alert" tone="slate" value={kpis.suppressed.toLocaleString('pt-BR')} label="Suprimidos (opt-out)" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <form action="/contacts" method="get" className="flex gap-2">
            {filters.role && <input type="hidden" name="role" value={filters.role} />}
            {filters.uf && <input type="hidden" name="uf" value={filters.uf} />}
            {filters.source && <input type="hidden" name="source" value={filters.source} />}
            {filters.seg && <input type="hidden" name="seg" value={filters.seg} />}
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Buscar nome, e-mail, telefone, município…"
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
            <Link href="/contacts" className="inline-block text-xs font-medium text-cyan-700 hover:underline">
              Limpar filtros ({activeFilterCount})
            </Link>
          )}

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Segmento</h3>
            <div className="space-y-1">
              {[
                { value: 'interacted', label: 'Com interação' },
                { value: 'inopp', label: 'Em oportunidade' },
                { value: 'never', label: 'Nunca contactado' },
              ].map((opt) => {
                const isActive = filters.seg === opt.value;
                return (
                  <Link
                    key={opt.value}
                    href={buildHref(sp, { seg: isActive ? '' : opt.value })}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                      isActive ? 'bg-cyan-50 font-semibold text-cyan-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

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
          <FacetGroup
            title="Município"
            facets={facets.municipio}
            active={filters.municipio}
            buildHref={(value, isActive) => buildHref(sp, { municipio: isActive ? '' : value })}
          />
          <FacetGroup
            title="Origem"
            facets={facets.source}
            active={filters.source}
            buildHref={(value, isActive) => buildHref(sp, { source: isActive ? '' : value })}
          />
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {total.toLocaleString('pt-BR')} contato{total === 1 ? '' : 's'} no recorte atual
            </div>
            <Link
              href="/marketing/whatsapp/new"
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
            >
              💬 Campanha WhatsApp
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Município/UF</th>
                    <th className="px-4 py-3">Última interação</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Opps</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const wa = digits(c.whatsapp) || digits(c.phone);
                    return (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2 w-2 shrink-0 rounded-full ${WA_DOT[c.waState]}`}
                              title={WA_TITLE[c.waState]}
                            />
                            <Link
                              href={`/contacts/${c.id}`}
                              className="font-medium text-slate-900 hover:text-i10-700 hover:underline"
                            >
                              {c.name ?? '(sem nome)'}
                            </Link>
                          </div>
                          {c.role && <div className="ml-4 text-xs text-slate-400">{c.role}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {c.municipio ? `${c.municipio}${c.uf ? `/${c.uf}` : ''}` : (c.uf ?? '—')}
                        </td>
                        <td className="px-4 py-3">
                          {c.lastInteraction ? (
                            <span className="text-slate-600">
                              {c.lastInteraction.label}{' '}
                              <span className="text-xs text-slate-400">· {ago(c.lastInteraction.at)}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">nunca contactado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.source ? <Chip tone="slate">{c.source}</Chip> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.oppCount > 0 ? (
                            <Chip tone={c.oppWon ? 'mint' : 'cyan'}>
                              {c.oppCount} {c.oppWon ? '· ganha' : 'ativa'}
                            </Chip>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {wa && c.waState !== 'bad' ? (
                              c.conversationId ? (
                                <Link
                                  href={`/marketing/conversas?c=${c.conversationId}`}
                                  className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:scale-110"
                                  title="Abrir conversa no inbox"
                                >
                                  <Icon name="msg" size={14} />
                                  <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${WA_DOT[c.waState]}`} />
                                </Link>
                              ) : (
                                <form action={startConversationWithContact} className="inline-flex">
                                  <input type="hidden" name="contactId" value={c.id} />
                                  <button
                                    type="submit"
                                    className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:scale-110"
                                    title="Iniciar conversa no inbox (template)"
                                  >
                                    <Icon name="msg" size={14} />
                                    <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${WA_DOT[c.waState]}`} />
                                  </button>
                                </form>
                              )
                            ) : (
                              <span
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-300 opacity-60"
                                title={WA_TITLE[c.waState]}
                              >
                                <Icon name="msg" size={14} />
                              </span>
                            )}
                            {c.email ? (
                              <a
                                href={`mailto:${c.email}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:scale-110"
                                title={c.email}
                              >
                                <Icon name="mail" size={14} />
                              </a>
                            ) : (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-300 opacity-60" title="Sem e-mail">
                                <Icon name="mail" size={14} />
                              </span>
                            )}
                            {c.phone || c.whatsapp ? (
                              <a
                                href={`tel:${wa}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700 transition hover:scale-110"
                                title={c.phone ?? c.whatsapp ?? ''}
                              >
                                <Icon name="phone" size={14} />
                              </a>
                            ) : (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-300 opacity-60" title="Sem telefone">
                                <Icon name="phone" size={14} />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                        Nenhum contato encontrado com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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

          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> WhatsApp validado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> nunca testado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> sem WhatsApp / opt-out
            </span>
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
