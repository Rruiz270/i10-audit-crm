import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listAssets, createAsset } from '@/lib/actions/marketing/assets';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({
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

  const items = await listAssets(id);
  const baseUrl = process.env.MARKETING_BASE_URL ?? 'http://localhost:3002';

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-6">
        <Link href={`/marketing/${id}`} className="text-xs text-slate-500 hover:text-slate-700">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Assets — PDFs com tracking de download
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Hospede aqui PDFs ou arquivos. Cada asset ganha uma URL pública que registra quem baixou
          (independente de canal — funciona pra emails do nosso engine, APM, ou compartilhamento
          direto).
        </p>
      </header>

      <section className="mb-8 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Novo asset</h2>
        <form action={createAsset} className="space-y-3">
          <input type="hidden" name="projectId" value={id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome (ex: Diagnóstico FUNDEB por município)
              </label>
              <input
                name="name"
                type="text"
                required
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select
                name="kind"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                defaultValue="pdf"
              >
                <option value="pdf">PDF</option>
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="other">Outro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Storage URL (link público do arquivo, ou template com{' '}
              <code className="bg-slate-100 px-1 rounded text-xs">{`{{ibge}}`}</code>)
            </label>
            <input
              name="storageUrl"
              type="url"
              required
              placeholder="https://institutoi10.com.br/fundeb-2026/api/download?pdf={{ibge}}.pdf"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono text-xs"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isTemplated" value="1" />
            URL contém{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">{`{{ibge}}`}</code> (resolvido pelo
            contact)
          </label>
          <button
            type="submit"
            className="block bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
          >
            Criar asset
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Assets ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum asset.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {items.map((a) => {
              const trackedUrl = `${baseUrl}/api/marketing/d/${a.id}`;
              return (
                <div key={a.id} className="p-4">
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {a.kind} {a.isTemplated && '· templated'} · target: {a.storageUrl.slice(0, 80)}
                  </div>
                  <div className="mt-3 bg-slate-50 rounded p-2 font-mono text-xs break-all">
                    <span className="text-slate-500">URL trackeada (compartilhe):</span>
                    <br />
                    <a href={trackedUrl} target="_blank" className="text-i10-700 underline">
                      {trackedUrl}
                    </a>
                    <br />
                    <span className="text-slate-500 text-[10px] mt-2 block">
                      Pra atribuir a um contact específico (uso em campanhas externas):{' '}
                      <code>?contact=email@example.com&campaign=slug</code>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
