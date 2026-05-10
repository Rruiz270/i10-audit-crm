import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq, and, sql } from 'drizzle-orm';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { db } from '@/lib/db';
import { getProject } from '@/lib/actions/marketing/projects';
import { importAttendanceCsv } from '@/lib/actions/marketing/attendance';
import { opportunities } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    created?: string;
    existed?: string;
    unmatched?: string;
    tagged?: string;
  }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { projectId } = await params;
  const sp = await searchParams;
  const id = Number(projectId);
  const project = await getProject(id);
  if (!project) notFound();

  // Stats: opps criadas via attendance pra esse project
  const oppStats = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(eq(opportunities.source, `webinar_attended_${project.slug}`));

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-6">
        <Link href={`/marketing/${id}`} className="text-xs text-slate-500 hover:text-slate-700">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Attendance — virar leads no CRM
        </h1>
      </header>

      {sp.created && (
        <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <div className="font-bold mb-1">✓ Import concluído</div>
          <div className="grid grid-cols-4 gap-3 mt-3">
            <div>
              <div className="text-xs uppercase text-green-700">Opps criadas</div>
              <div className="text-2xl font-bold">{sp.created}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-green-700">Já existiam</div>
              <div className="text-2xl font-bold">{sp.existed}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-green-700">Não matched</div>
              <div className="text-2xl font-bold">{sp.unmatched}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-green-700">Re-tagged</div>
              <div className="text-2xl font-bold">{sp.tagged}</div>
            </div>
          </div>
        </div>
      )}

      <section className="mb-8 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">
          Subir CSV de presentes (Google Meet / Zoom / Teams export)
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Aceita qualquer CSV com coluna <code className="bg-slate-100 px-1 rounded">email</code>{' '}
          (variações: Email, EMAIL, e-mail, &quot;User Email&quot; etc). Opcional:{' '}
          <code>ibge</code> pra linkar ao município.
          <br />
          <b>Para cada email matched:</b> tag <code>webinar_attended</code> + cria opp em{' '}
          <code>/pipeline</code> stage <code>novo</code>, atribuído round-robin a um consultor
          ativo, com atividade de auditoria.
        </p>
        <form action={importAttendanceCsv} className="space-y-3">
          <input type="hidden" name="projectId" value={id} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Label do evento (vai no opp.notes e activity.subject)
            </label>
            <input
              name="eventLabel"
              type="text"
              required
              placeholder="Webinar FUNDEB 21/mai/2026"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
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
            Importar e criar leads
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Histórico — opps geradas via attendance
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm">
          <span className="text-slate-600">Total de opps com source </span>
          <code className="bg-slate-100 px-1 rounded text-xs">
            webinar_attended_{project.slug}
          </code>
          <span className="text-slate-600">: </span>
          <b className="text-slate-900">{oppStats[0]?.count ?? 0}</b>
          <Link
            href={`/opportunities?source=webinar_attended_${project.slug}`}
            className="ml-3 text-i10-700 hover:underline text-xs"
          >
            ver todas →
          </Link>
        </div>
      </section>
    </div>
  );
}
