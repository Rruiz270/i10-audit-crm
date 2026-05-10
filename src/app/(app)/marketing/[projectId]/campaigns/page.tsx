import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listCampaigns } from '@/lib/actions/marketing/campaigns';

export const dynamic = 'force-dynamic';

export default async function CampaignsListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { projectId } = await params;
  const id = Number(projectId);
  const project = await getProject(id);
  if (!project) notFound();

  const campaigns = await listCampaigns(id);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href={`/marketing/${id}`} className="text-xs text-slate-500 hover:text-slate-700">
            ← {project.name}
          </Link>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
            Campanhas
          </h1>
        </div>
        <Link
          href={`/marketing/${id}/campaigns/new`}
          className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
        >
          + Nova campanha
        </Link>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma campanha ainda.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/marketing/${id}/campaigns/${c.id}`}
              className="block p-4 hover:bg-slate-50 transition"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    status: {c.status} · {c.totalRecipients} destinatários · provider:{' '}
                    {c.provider ?? 'default'}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <div>{c.sentCount} sent · {c.openCount} opens · {c.clickCount} clicks</div>
                  <div className="text-slate-400 mt-0.5">
                    {c.bounceCount} bounces · {c.unsubscribeCount} unsub · {c.complaintCount} complaints
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
