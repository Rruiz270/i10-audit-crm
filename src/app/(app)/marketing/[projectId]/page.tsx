import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listAudiences } from '@/lib/actions/marketing/audiences';
import { listTemplates } from '@/lib/actions/marketing/templates';
import { listCampaigns } from '@/lib/actions/marketing/campaigns';
import { getWhatsAppConfig, getTemplateApproval } from '@/lib/marketing/whatsapp-health';
import { ChannelBadge, WhatsAppHealthPanel } from '@/components/marketing-channel';

export const dynamic = 'force-dynamic';

export default async function ProjectDashboardPage({
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

  const [aud, tpl, camp] = await Promise.all([
    listAudiences(id),
    listTemplates(id),
    listCampaigns(id),
  ]);

  // Canal WhatsApp: config + status de aprovação (ao vivo) dos templates com Content SID.
  const waConfig = getWhatsAppConfig();
  const waTpls = tpl.filter((t) => t.channel === 'whatsapp' && t.waTemplateName);
  const waTemplates = await Promise.all(
    waTpls.map(async (t) => ({
      id: t.id,
      name: t.name,
      contentSid: t.waTemplateName as string,
      approval: await getTemplateApproval(t.waTemplateName as string),
    })),
  );
  // Mapa templateId → channel, pra badge nas campanhas.
  const channelByTemplate = new Map(tpl.map((t) => [t.id, t.channel]));

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8">
        <Link href="/marketing" className="text-xs text-slate-500 hover:text-slate-700">
          ← Marketing engine
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          {project.name}
        </h1>
        {project.description && <p className="text-sm text-slate-500 mt-1">{project.description}</p>}
      </header>

      <div className="grid grid-cols-5 gap-3 mb-8">
        <DashCard
          title="Audiências"
          count={aud.length}
          href={`/marketing/${id}/audiences`}
          subtitle={`${aud.reduce((s, a) => s + a.contactCount, 0)} contatos`}
        />
        <DashCard
          title="Templates"
          count={tpl.length}
          href={`/marketing/${id}/templates`}
          subtitle="Email + WA"
        />
        <DashCard
          title="Campanhas"
          count={camp.length}
          href={`/marketing/${id}/campaigns`}
          subtitle={camp.filter((c) => c.status === 'sending').length + ' enviando'}
        />
        <DashCard
          title="Assets"
          count={0}
          href={`/marketing/${id}/assets`}
          subtitle="PDFs + tracking"
        />
        <DashCard
          title="Attendance"
          count={0}
          href={`/marketing/${id}/attendance`}
          subtitle="CSV → CRM opp"
        />
      </div>

      <WhatsAppHealthPanel config={waConfig} templates={waTemplates} />

      {camp.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Campanhas recentes</h2>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {camp.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                href={`/marketing/${id}/campaigns/${c.id}`}
                className="block p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <ChannelBadge channel={channelByTemplate.get(c.templateId)} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {c.totalRecipients} destinatários · status {c.status}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {c.sentCount}/{c.totalRecipients} enviados
                    {c.openCount > 0 && ` · ${c.openCount} opens`}
                    {c.clickCount > 0 && ` · ${c.clickCount} clicks`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DashCard({
  title,
  count,
  href,
  subtitle,
}: {
  title: string;
  count: number;
  href: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-i10-300 transition"
    >
      <div className="text-xs text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-bold text-slate-900 mt-2">{count}</div>
      <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
    </Link>
  );
}
