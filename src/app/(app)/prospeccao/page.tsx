import Link from 'next/link';
import { rankedProspects, type RankedProspect } from '@/lib/prospecting';
import { KpiTile } from '@/components/ui/kpi-tile';
import { FacetGroup } from '@/components/ui/facet-group';

export const dynamic = 'force-dynamic';

type RawSearch = {
  uf?: string;
  status?: string; // 'livre' | 'em_pipeline'
};

function buildHref(base: RawSearch, overrides: Partial<RawSearch>): string {
  const merged: Record<string, string | undefined> = { ...base, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/prospeccao?${qs}` : '/prospeccao';
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 40
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${tone}`}>
      {score}
    </span>
  );
}

function statusOf(p: RankedProspect): 'consultoria' | 'em_pipeline' | 'livre' {
  if (p.consultorias > 0) return 'consultoria';
  if (p.openOpportunities > 0) return 'em_pipeline';
  return 'livre';
}

export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: Promise<RawSearch>;
}) {
  const sp = await searchParams;
  const uf = sp.uf?.toUpperCase() || undefined;
  const status = sp.status === 'livre' || sp.status === 'em_pipeline' ? sp.status : undefined;

  const all = await rankedProspects();

  const ufFacets = Object.entries(
    all.reduce<Record<string, number>>((acc, p) => {
      if (p.uf) acc[p.uf] = (acc[p.uf] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  const statusFacets = [
    { value: 'livre', count: all.filter((p) => statusOf(p) === 'livre').length },
    { value: 'em_pipeline', count: all.filter((p) => statusOf(p) !== 'livre').length },
  ];

  const rows = all.filter((p) => {
    if (uf && p.uf !== uf) return false;
    if (status === 'livre' && statusOf(p) !== 'livre') return false;
    if (status === 'em_pipeline' && statusOf(p) === 'livre') return false;
    return true;
  });

  const potencialTotal = rows.reduce((acc, p) => acc + (p.valorEstimado ?? 0), 0);
  const livres = rows.filter((p) => statusOf(p) === 'livre').length;
  const quentes = rows.filter((p) => p.score >= 70).length;
  const activeFilterCount = [uf, status].filter(Boolean).length;

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
          Operação
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Prospecção FUNDEB
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Municípios ranqueados por potencial (dados públicos FNDE/SIOPE — VAAT/VAAR, matrículas e
          receita). Importe/atualize com <code className="bg-slate-100 px-1">npm run prospects:import</code>.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon="chart" tone="navy" value={rows.length} label="Municípios com dados" />
        <KpiTile
          icon="flag"
          tone="cyan"
          value={quentes}
          label="Score ≥ 70"
          badge={quentes > 0 ? { text: 'priorizar', tone: 'cyan' } : undefined}
        />
        <KpiTile icon="briefcase" tone="mint" value={livres} label="Sem oportunidade aberta" />
        <KpiTile icon="activity" tone="amber" value={brl(potencialTotal)} label="Potencial anual (recorte)" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-5">
          {activeFilterCount > 0 && (
            <Link
              href="/prospeccao"
              className="inline-block text-xs font-medium text-cyan-700 hover:underline"
            >
              Limpar filtros ({activeFilterCount})
            </Link>
          )}

          <FacetGroup
            title="Status"
            facets={statusFacets}
            active={status}
            buildHref={(value, isActive) => buildHref(sp, { status: isActive ? '' : value })}
            labelFn={(v) => (v === 'livre' ? 'Sem oportunidade' : 'Já trabalhado')}
          />
          <FacetGroup
            title="UF"
            facets={ufFacets}
            active={uf}
            buildHref={(value, isActive) => buildHref(sp, { uf: isActive ? '' : value })}
          />
        </aside>

        <section className="min-w-0">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              <p className="italic">Nenhum município com dados de prospecção neste recorte.</p>
              <p className="mt-2">
                Importe os dados públicos com{' '}
                <code className="bg-slate-100 px-1">
                  node scripts/enrich-fundeb-prospects.mjs dados.csv
                </code>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Município</th>
                    <th className="px-4 py-3 text-right">Matrículas</th>
                    <th className="px-4 py-3 text-right">Receita FUNDEB/ano</th>
                    <th className="px-4 py-3">Complementações</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-right">Potencial estimado</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => {
                    const st = statusOf(p);
                    return (
                      <tr key={p.municipalityId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.nome}</div>
                          <div className="text-xs text-slate-500">
                            {p.uf ?? '—'}
                            {p.anoReferencia ? ` · dados ${p.anoReferencia}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.matriculas != null ? p.matriculas.toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.receitaFundeb != null ? brl(p.receitaFundeb) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {(p.complementacaoVaat ?? 0) > 0 && (
                              <span className="rounded bg-i10-cyan-wash px-1.5 py-0.5 text-[10px] font-bold text-i10-cyan-dark">
                                VAAT
                              </span>
                            )}
                            {(p.complementacaoVaar ?? 0) > 0 && (
                              <span className="rounded bg-i10-mint-wash px-1.5 py-0.5 text-[10px] font-bold text-i10-mint-dark">
                                VAAR
                              </span>
                            )}
                            {(p.complementacaoVaat ?? 0) <= 0 && (p.complementacaoVaar ?? 0) <= 0 && (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScoreBadge score={p.score} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                          {p.valorEstimado != null ? brl(p.valorEstimado) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {st === 'consultoria' ? (
                            <span className="text-xs font-medium text-violet-700">Consultoria</span>
                          ) : st === 'em_pipeline' ? (
                            <span className="text-xs font-medium text-amber-700">Em pipeline</span>
                          ) : (
                            <span className="text-xs text-slate-400">Livre</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {st === 'livre' && (
                            <Link
                              href={`/opportunities/new?municipio=${encodeURIComponent(p.nome)}&uf=${p.uf ?? ''}&origem=${encodeURIComponent('Prospecção FUNDEB')}`}
                              className="whitespace-nowrap text-xs font-medium text-cyan-700 hover:underline"
                            >
                              + Oportunidade
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-400">
            Score 0–100 (porte da rede, dependência de VAAT, VAAR e receita) e potencial estimado
            (≈2% da receita FUNDEB + 10% da complementação VAAT) — heurística sobre dados públicos;
            ver <code className="bg-slate-100 px-1">src/lib/prospecting.ts</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
