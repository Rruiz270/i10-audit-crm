import Link from 'next/link';
import { listOpportunities, listUsersForAssignment } from '@/lib/actions/opportunities';
import { getMyPreferences } from '@/lib/actions/me';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { FacetGroup } from '@/components/ui/facet-group';
import { OpportunitiesTable } from '@/components/opportunities-table';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { requireUser } from '@/lib/session';
import { getTagStyleMap } from '@/lib/actions/tags';
import { ACTIVE_STAGES, STAGES_BY_KEY, type StageKey } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; tag?: string; mine?: string; desde?: string; ate?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const prefs = await getMyPreferences(user.id);

  const mine =
    params.mine === '1' || params.mine === 'true'
      ? true
      : params.mine === '0' || params.mine === 'false'
        ? false
        : prefs.defaultPipelineFilter === 'mine';

  const rows = await listOpportunities({
    stage: params.stage as StageKey | undefined,
    ownerId: mine ? user.id : undefined,
    desde: params.desde,
    ate: params.ate,
  });
  const [users, tagStyles] = await Promise.all([listUsersForAssignment(), getTagStyleMap()]);

  const canBulk = ['admin', 'gestor'].includes(user.role);
  const filteredCount = params.tag
    ? rows.filter((r) => (r.tags ?? []).includes(params.tag!)).length
    : rows.length;

  // Constrói links preservando filtros atuais
  const qs = (overrides: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (params.stage) q.set('stage', params.stage);
    if (params.tag) q.set('tag', params.tag);
    if (params.desde) q.set('desde', params.desde);
    if (params.ate) q.set('ate', params.ate);
    if (params.mine) q.set('mine', params.mine);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  // Facets de tag agrupados por categoria (da taxonomia crm.tags).
  const tagCounts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const byCategory = new Map<string, { value: string; count: number }[]>();
  for (const [tag, n] of tagCounts.entries()) {
    const cat = tagStyles[tag]?.category ?? 'Outras';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ value: tag, count: n });
  }
  for (const list of byCategory.values()) list.sort((a, b) => a.value.localeCompare(b.value));
  const tagCategories = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const stageOptions = [
    { value: '', label: 'Todos', href: `/opportunities${qs({ stage: undefined })}` },
    ...ACTIVE_STAGES.map((s) => ({
      value: s.key,
      label: s.label,
      href: `/opportunities${qs({ stage: s.key })}`,
    })),
  ];

  return (
    <div className="px-8 py-8 max-w-7xl">
      <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="i10-eyebrow mb-1">Funil</div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Oportunidades{mine && ' · minhas'}{' '}
            <span className="text-base font-normal text-slate-400">· {filteredCount}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {params.stage ? `Filtrado por ${STAGES_BY_KEY[params.stage as StageKey]?.label ?? params.stage}` : 'Todas as oportunidades ativas'}
            {params.tag ? ` · tag "${params.tag}"` : ''}
            {canBulk && rows.length > 0 && ' · selecione para ações em massa'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl
            value={mine ? 'mine' : 'all'}
            options={[
              { value: 'all', label: 'Todas', href: `/opportunities${qs({ mine: '0' })}` },
              { value: 'mine', label: 'Minhas', href: `/opportunities${qs({ mine: '1' })}` },
            ]}
          />
          <Link href="/opportunities/new">
            <Button variant="accent">
              <Icon name="plus" size={16} /> Nova oportunidade
            </Button>
          </Link>
        </div>
      </header>

      {/* Barra de filtros: estágio (segmented) + período de entrada + tags */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl value={params.stage ?? ''} options={stageOptions} />
      </div>
      <div className="mb-4">
        <DateRangeFilter
          desde={params.desde}
          ate={params.ate}
          basePath="/opportunities"
          outros={{ stage: params.stage, tag: params.tag, mine: params.mine }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <aside className="space-y-4">
          {tagCategories.length === 0 ? (
            <div className="text-xs text-slate-400">Sem tags nesta seleção.</div>
          ) : (
            tagCategories.map(([cat, facets]) => (
              <FacetGroup
                key={cat}
                title={cat}
                facets={facets}
                active={params.tag}
                buildHref={(value, isActive) =>
                  `/opportunities${qs({ tag: isActive ? undefined : value })}`
                }
              />
            ))
          )}
        </aside>

        <OpportunitiesTable
          rows={rows}
          users={users}
          canBulk={canBulk}
          isAdmin={canBulk}
          tagFilter={params.tag}
          tagStyles={tagStyles}
        />
      </div>
    </div>
  );
}
