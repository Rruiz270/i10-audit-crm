import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leadForms, leadSubmissions } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const forms = await db.select().from(leadForms).orderBy(desc(leadForms.createdAt));
  const submissions = await db
    .select({
      id: leadSubmissions.id,
      formId: leadSubmissions.formId,
      formSlug: leadForms.slug,
      formTitle: leadForms.title,
      payload: leadSubmissions.payload,
      submittedAt: leadSubmissions.submittedAt,
      triaged: leadSubmissions.triaged,
      opportunityId: leadSubmissions.opportunityId,
    })
    .from(leadSubmissions)
    .leftJoin(leadForms, eq(leadSubmissions.formId, leadForms.id))
    .orderBy(desc(leadSubmissions.submittedAt))
    .limit(200);

  return (
    <div className="px-8 py-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Leads (entrada pública)</h1>
        <p className="text-sm text-slate-500 mt-1">
          {submissions.length} submissõe{submissions.length === 1 ? '' : 's'} · {forms.length} formulário{forms.length === 1 ? '' : 's'} ativos
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Formulários publicados</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {forms.map((f) => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-sm font-medium text-slate-900">{f.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{f.description}</div>
              <div className="mt-3 flex items-center justify-between">
                <Link
                  href={`/intake/${f.slug}`}
                  target="_blank"
                  className="text-xs text-i10-700 hover:underline"
                >
                  /intake/{f.slug} →
                </Link>
                <span className={`text-xs ${f.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {f.isActive ? 'ativo' : 'inativo'}
                </span>
              </div>
            </div>
          ))}
          {forms.length === 0 && (
            <div className="col-span-full text-xs text-slate-500 italic">
              Rode <code className="bg-slate-100 px-1">npm run seed</code> para criar o formulário padrão.
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Submissões</h2>
        {submissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500 italic">
            Nenhuma submissão ainda. Acesse um formulário público para testar.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Recebido</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Formulário</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Payload</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-600 uppercase">Triagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.formTitle ?? `#${s.formId}`}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 max-w-xl truncate" title={JSON.stringify(s.payload)}>
                      {renderPayload(s.payload)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.triaged ? (
                        <Link href={`/opportunities/${s.opportunityId}`} className="text-i10-700 hover:underline">
                          → Oport. #{s.opportunityId}
                        </Link>
                      ) : (
                        <span className="text-amber-700">pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function renderPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload);
  const obj = payload as Record<string, unknown>;
  return Object.entries(obj)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(' · ');
}
