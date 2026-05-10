import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listTemplates, createTemplate } from '@/lib/actions/marketing/templates';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({
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

  const templates = await listTemplates(id);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <Link href={`/marketing/${id}`} className="text-xs text-slate-500 hover:text-slate-700">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Templates
        </h1>
      </header>

      <section className="mb-8 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Novo template (email)</h2>
        <form action={createTemplate} className="space-y-3">
          <input type="hidden" name="projectId" value={id} />
          <input type="hidden" name="channel" value="email" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome interno</label>
              <input
                name="name"
                type="text"
                required
                placeholder="E1 — Webinar invite (prefeito)"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Subject (assunto do email)
              </label>
              <input
                name="subject"
                type="text"
                required
                placeholder="{{municipio}}/{{uf}} pode captar R$ {{valor_potencial}} a mais"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              HTML completo (cole o template renderizado, com {`{{vars}}`})
            </label>
            <textarea
              name="html"
              rows={10}
              required
              placeholder="<!DOCTYPE html><html>..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-xs"
            />
          </div>
          <div className="text-xs text-slate-500">
            Tip: use <code className="bg-slate-100 px-1 rounded">{`{{unsubscribe_url}}`}</code> no
            footer pra controlar onde o link de descadastro aparece. Caso contrário, um footer LGPD
            padrão é adicionado automaticamente.
          </div>
          <button
            type="submit"
            className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
          >
            Criar template
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Templates ({templates.length})
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum template ainda.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {templates.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.channel} · subject: {t.subject?.slice(0, 80) ?? '—'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {(t.variables ?? []).length} variáveis: {(t.variables ?? []).slice(0, 8).join(', ')}
                      {(t.variables ?? []).length > 8 && '…'}
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap"
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
