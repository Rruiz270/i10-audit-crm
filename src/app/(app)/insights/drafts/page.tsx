import Link from 'next/link';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = ['all', 'pending', 'approved', 'published', 'rejected', 'failed'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

export default async function DraftsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const sp = await searchParams;
  const filter = (STATUS_OPTIONS as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as StatusFilter)
    : 'all';

  const sql = neon(process.env.DATABASE_URL!);
  const drafts =
    filter === 'all'
      ? await sql`SELECT id, title_pt, category, status, created_at, banned_word_hits FROM insights.drafts ORDER BY created_at DESC LIMIT 100`
      : await sql`SELECT id, title_pt, category, status, created_at, banned_word_hits FROM insights.drafts WHERE status = ${filter} ORDER BY created_at DESC LIMIT 100`;

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <Link href="/insights" className="text-xs text-slate-500 hover:text-slate-700">
          ← Insights
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Drafts
        </h1>
      </header>

      <nav className="mb-4 flex gap-2">
        {STATUS_OPTIONS.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/insights/drafts' : `/insights/drafts?status=${s}`}
            className={
              'text-xs px-3 py-1 rounded-full ' +
              (filter === s ? 'bg-i10-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
            }
          >
            {s}
          </Link>
        ))}
      </nav>

      {drafts.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum draft com filtro {filter}.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {drafts.map((d) => {
            const violations = d.banned_word_hits;
            const hasViolations = Array.isArray(violations) && violations.length > 0;
            return (
              <Link
                key={d.id}
                href={`/insights/drafts/${d.id}`}
                className="block p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">
                      {d.title_pt}
                      {hasViolations && <span className="ml-2 text-amber-600">⚠</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {d.category} · {new Date(d.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {d.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
