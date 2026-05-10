import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { listProjects, createProject } from '@/lib/actions/marketing/projects';

export const dynamic = 'force-dynamic';

export default async function MarketingHomePage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const projects = await listProjects();
  const testAllowlist = process.env.MARKETING_TEST_ALLOWLIST;

  return (
    <div className="px-8 py-8 max-w-5xl">
      {testAllowlist && (
        <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">🛑</span>
            <div>
              <div className="font-bold">TEST MODE ativo</div>
              <div className="mt-1">
                Envios bloqueados pra qualquer email fora da allowlist. Permitidos:{' '}
                <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">{testAllowlist}</code>
              </div>
              <div className="text-xs mt-2 text-amber-700">
                Pra desativar e liberar disparo geral: remove{' '}
                <code>MARKETING_TEST_ALLOWLIST</code> do <code>.env.local</code> (dev) ou das env
                vars Vercel (prod).
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Marketing engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Disparos nativos de email + WhatsApp com tracking completo, suppression LGPD e CRM bridge.
          </p>
        </div>
      </header>

      <section className="mb-10">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Novo projeto</h2>
          <form action={createProject} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                placeholder="Webinar FUNDEB Brasil 2026"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Descrição
              </label>
              <textarea
                name="description"
                rows={2}
                placeholder="Captação de prefeitos e secretários para o webinar de 21/mai"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
            >
              Criar projeto
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Projetos ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum projeto ainda — crie o primeiro acima.</p>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/marketing/${p.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-i10-300 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">{p.name}</div>
                    {p.description && (
                      <div className="text-sm text-slate-500 mt-1 line-clamp-2">{p.description}</div>
                    )}
                    <div className="text-xs text-slate-400 mt-2">
                      slug: {p.slug} · status: {p.status}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
