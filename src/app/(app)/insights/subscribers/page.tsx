import Link from 'next/link';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const sp = await searchParams;
  const filter = sp.status ?? 'all';
  const sql = neon(process.env.DATABASE_URL!);

  const rows =
    filter === 'all'
      ? await sql`SELECT id, email, locale, status, created_at, confirmed_at, last_email_sent_at FROM insights.subscribers ORDER BY created_at DESC LIMIT 200`
      : await sql`SELECT id, email, locale, status, created_at, confirmed_at, last_email_sent_at FROM insights.subscribers WHERE status = ${filter} ORDER BY created_at DESC LIMIT 200`;

  const STATUSES = [
    'all',
    'confirmed',
    'pending_confirmation',
    'unsubscribed',
    'bounced',
    'complained',
  ];

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <Link href="/insights" className="text-xs text-slate-500 hover:text-slate-700">
          ← Insights
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Subscribers
        </h1>
      </header>

      <nav className="mb-4 flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/insights/subscribers' : `/insights/subscribers?status=${s}`}
            className={
              'text-xs px-3 py-1 rounded-full ' +
              (filter === s ? 'bg-i10-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
            }
          >
            {s}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum subscriber.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Locale</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Criado</th>
                <th className="text-left p-3">Último email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-mono text-xs">{r.email}</td>
                  <td className="p-3">{r.locale}</td>
                  <td className="p-3">
                    <span className={
                      'text-xs px-2 py-0.5 rounded ' +
                      (r.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                       r.status === 'pending_confirmation' ? 'bg-amber-100 text-amber-700' :
                       'bg-slate-100 text-slate-600')
                    }>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {r.last_email_sent_at ? new Date(r.last_email_sent_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Total: {rows.length} {rows.length === 200 && '(limit 200, considere filtrar)'}
      </p>
    </div>
  );
}
