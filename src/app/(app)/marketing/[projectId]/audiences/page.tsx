import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listAudiences, importContactsFromCsv } from '@/lib/actions/marketing/audiences';

export const dynamic = 'force-dynamic';

export default async function AudiencesPage({
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

  const audiences = await listAudiences(id);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <Link href={`/marketing/${id}`} className="text-xs text-slate-500 hover:text-slate-700">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Audiências
        </h1>
      </header>

      <section className="mb-8 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Importar CSV (FUNDEB Brasil)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Aceita o formato disparo-fundeb-brasil/data/disparo-nao-sp.csv (4.923 munis × 3 emails =
          até ~14k contatos). Suppressions e duplicatas são tratadas automaticamente.
        </p>
        <form action={importContactsFromCsv} className="space-y-3">
          <input type="hidden" name="projectId" value={id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome da audiência
              </label>
              <input
                name="audienceName"
                type="text"
                required
                placeholder="Prefeitos pessoais — Brasil ex-SP"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Filtrar role (opcional)
              </label>
              <select
                name="targetRole"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">Todos (3 roles por linha)</option>
                <option value="prefeito_pessoal">Apenas prefeito_pessoal (TSE)</option>
                <option value="prefeitura">Apenas prefeitura (institucional)</option>
                <option value="educacao">Apenas educação (institucional)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Arquivo CSV</label>
            <input
              name="csv"
              type="file"
              accept=".csv,text/csv"
              required
              className="w-full text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
          >
            Importar
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Audiências ({audiences.length})
        </h2>
        {audiences.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma audiência ainda — importe um CSV acima.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {audiences.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">{a.name}</div>
                  {a.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{a.description}</div>
                  )}
                  <div className="text-xs text-slate-400 mt-1">source: {a.source}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900">{a.contactCount}</div>
                  <div className="text-xs text-slate-500">contatos</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
