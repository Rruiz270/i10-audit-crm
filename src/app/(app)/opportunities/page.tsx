import Link from 'next/link';
import { listOpportunities, listUsersForAssignment } from '@/lib/actions/opportunities';
import { getMyPreferences } from '@/lib/actions/me';
import { Button } from '@/components/ui/button';
import { OpportunitiesTable } from '@/components/opportunities-table';
import { requireUser } from '@/lib/session';
import type { StageKey } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; tag?: string; mine?: string }>;
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
  });
  const users = await listUsersForAssignment();

  const canBulk = ['admin', 'gestor'].includes(user.role);
  const filteredCount = params.tag
    ? rows.filter((r) => (r.tags ?? []).includes(params.tag!)).length
    : rows.length;

  // Constrói links do toggle preservando filtros atuais
  const qs = (overrides: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (params.stage) q.set('stage', params.stage);
    if (params.tag) q.set('tag', params.tag);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="px-8 py-8 max-w-7xl">
      <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Oportunidades{mine && ' · minhas'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {filteredCount} oportunidade{filteredCount === 1 ? '' : 's'}
            {params.stage ? ` em ${params.stage}` : ''}
            {params.tag ? ` com tag "${params.tag}"` : ''}
            {canBulk && rows.length > 0 && ' · selecione para reatribuir em massa'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md overflow-hidden border border-slate-200 bg-white text-xs font-semibold">
            <Link
              href={`/opportunities${qs({ mine: '0' })}`}
              className={`px-3 py-1.5 transition-colors ${
                !mine ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={!mine ? { background: 'var(--i10-navy)' } : undefined}
            >
              Todas
            </Link>
            <Link
              href={`/opportunities${qs({ mine: '1' })}`}
              className={`px-3 py-1.5 transition-colors ${
                mine ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
              style={mine ? { background: 'var(--i10-navy)' } : undefined}
            >
              Minhas
            </Link>
          </div>
          <Link href="/opportunities/new">
            <Button>+ Nova oportunidade</Button>
          </Link>
        </div>
      </header>

      <OpportunitiesTable rows={rows} users={users} canBulk={canBulk} isAdmin={user.role === 'admin'} tagFilter={params.tag} />
    </div>
  );
}
