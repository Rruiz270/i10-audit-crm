import Link from 'next/link';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function getDashboard() {
  const sql = neon(process.env.DATABASE_URL!);
  const [drafts] = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'pending')::int   AS pending,
      count(*) FILTER (WHERE status = 'approved')::int  AS approved,
      count(*) FILTER (WHERE status = 'published')::int AS published,
      count(*) FILTER (WHERE status = 'rejected')::int  AS rejected
    FROM insights.drafts
  `;
  const [arts] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::int AS this_week
    FROM insights.articles
  `;
  const [subs] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'confirmed')::int    AS confirmed,
      count(*) FILTER (WHERE status = 'pending_confirmation')::int AS pending,
      count(*) FILTER (WHERE status = 'unsubscribed')::int AS unsub
    FROM insights.subscribers
  `;
  const [emailsLast7] = await sql`
    SELECT count(*)::int AS c
    FROM insights.email_log
    WHERE sent_at >= NOW() - INTERVAL '7 days'
  `;
  const recentDrafts = await sql`
    SELECT id, title_pt, category, created_at, status
    FROM insights.drafts
    ORDER BY created_at DESC
    LIMIT 5
  `;
  return { drafts, arts, subs, emailsLast7, recentDrafts };
}

export default async function InsightsAdminPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { drafts, arts, subs, emailsLast7, recentDrafts } = await getDashboard();

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          i10 Insights
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Newsletter diária IA + educação. Manus AI gera, admin aprova, Brevo dispara.
        </p>
      </header>

      <section className="grid grid-cols-4 gap-3 mb-8">
        <Stat title="Drafts pending" value={drafts.pending} href="/insights/drafts?status=pending" />
        <Stat title="Articles total" value={arts.total} subtitle={`${arts.this_week} essa semana`} />
        <Stat title="Subscribers" value={subs.confirmed} href="/insights/subscribers" subtitle={`${subs.pending} pending · ${subs.unsub} unsub`} />
        <Stat title="Emails 7d" value={emailsLast7.c} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Drafts recentes</h2>
        {recentDrafts.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum draft ainda.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {recentDrafts.map((d) => (
              <Link
                key={d.id}
                href={`/insights/drafts/${d.id}`}
                className="block p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{d.title_pt}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {d.category} · {new Date(d.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <span className={
                    'text-xs px-2 py-0.5 rounded ' +
                    (d.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                     d.status === 'published' ? 'bg-green-100 text-green-700' :
                     d.status === 'rejected' ? 'bg-red-100 text-red-700' :
                     'bg-slate-100 text-slate-600')
                  }>
                    {d.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Link href="/insights/drafts" className="text-sm text-i10-700 hover:underline">
            Ver todos drafts →
          </Link>
          <Link href="/insights/subscribers" className="text-sm text-i10-700 hover:underline ml-4">
            Subscribers →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ title, value, subtitle, href }: { title: string; value: number; subtitle?: string; href?: string }) {
  const inner = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-i10-300 transition">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1">{value.toLocaleString('pt-BR')}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
