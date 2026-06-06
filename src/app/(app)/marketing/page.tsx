import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { listProjects, createProject } from '@/lib/actions/marketing/projects';
import { getHubStats } from '@/lib/actions/marketing/hub';
import { HubTile } from '@/components/marketing-hub';

export const dynamic = 'force-dynamic';

export default async function MarketingHomePage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const [projects, stats] = await Promise.all([listProjects(), getHubStats()]);
  const testAllowlist = process.env.MARKETING_TEST_ALLOWLIST;

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Marketing
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hub omnichannel — WhatsApp, Email, Conversas e base de leads, com tracking e LGPD nativos.
        </p>
      </header>

      {testAllowlist && (
        <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-bold">Modo de teste ativo</div>
          <div className="mt-1">
            Envios bloqueados para quem está fora da allowlist (e-mail/telefone). Remova{' '}
            <code>MARKETING_TEST_ALLOWLIST</code> / <code>MARKETING_TEST_ALLOWLIST_PHONE</code> nas env
            vars para liberar disparo geral.
          </div>
        </div>
      )}

      {/* ── Tiles do hub ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HubTile
          href="#projetos"
          icon="msg"
          tone="wa"
          title="WhatsApp Campaigns"
          metric={stats.waSent.toLocaleString('pt-BR')}
          sub={`${stats.waCampaigns} campanhas · enviados`}
          action="Nova campanha WhatsApp"
        />
        <HubTile
          href="#projetos"
          icon="mail"
          tone="em"
          title="Email Campaigns"
          metric={stats.emailOpenRate != null ? `${stats.emailOpenRate}%` : '—'}
          sub={`${stats.emailCampaigns} campanhas · taxa de abertura`}
          action="Nova campanha Email"
        />
        <HubTile
          href="/marketing/conversas"
          icon="inbox"
          tone="cv"
          title="Conversas"
          isNew
          metric="—"
          sub="inbox WhatsApp ao vivo (em construção)"
          action="Abrir inbox"
        />
        <HubTile
          href="/leads"
          icon="users"
          tone="ld"
          title="Leads Hub"
          metric={stats.contacts.toLocaleString('pt-BR')}
          sub="base única de contatos · compartilhada"
          action="Gerenciar base"
        />
        <HubTile
          href="/marketing/social"
          icon="mega"
          tone="neutral"
          title="Social Media"
          metric="Meta"
          sub="calendário e posts (app externo)"
          action="Abrir calendário"
        />
        <HubTile
          href="/marketing/insights"
          icon="chart"
          tone="neutral"
          title="Insights"
          metric="Analytics"
          sub="conteúdo e métricas cross-canal"
          action="Ver analytics"
        />
      </div>

      {/* ── Projetos ── */}
      <section id="projetos" className="mt-10 scroll-mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            Projetos ({projects.length})
          </h2>
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800">
              + Novo projeto
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <form action={createProject} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="Webinar FUNDEB Brasil 2026"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Descrição</label>
                  <textarea
                    name="description"
                    rows={2}
                    placeholder="Captação de prefeitos e secretários…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
                >
                  Criar projeto
                </button>
              </form>
            </div>
          </details>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum projeto ainda — use “+ Novo projeto” para criar o primeiro.
          </p>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/marketing/${p.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-i10-300"
              >
                <div className="text-base font-semibold text-slate-900">{p.name}</div>
                {p.description && (
                  <div className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</div>
                )}
                <div className="mt-2 text-xs text-slate-400">
                  slug: {p.slug} · status: {p.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
