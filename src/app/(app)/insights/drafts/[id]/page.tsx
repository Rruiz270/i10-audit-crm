import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { approveDraft, rejectDraft } from '@/lib/actions/insights/drafts';

export const dynamic = 'force-dynamic';

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const drafts = await sql`SELECT * FROM insights.drafts WHERE id = ${id} LIMIT 1`;
  if (drafts.length === 0) notFound();
  const d = drafts[0];

  const violations = Array.isArray(d.banned_word_hits) ? d.banned_word_hits : [];

  return (
    <div className="px-8 py-8 max-w-3xl">
      <Link href="/insights/drafts" className="text-xs text-slate-500 hover:text-slate-700">
        ← Drafts
      </Link>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-i10-700">
        {String(d.category)} · status: <code className="bg-slate-100 px-1 rounded">{String(d.status)}</code>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{String(d.title_pt)}</h1>
      <h2 className="mt-1 text-base italic text-slate-500">{String(d.title_en)}</h2>

      {violations.length > 0 && (
        <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <p className="font-semibold">⚠ Palavras banidas detectadas:</p>
          <ul className="mt-2 list-disc pl-5">
            {(violations as Array<{ field: string; word: string; count: number }>).map((v, i) => (
              <li key={i}>
                <code>{v.field}</code>: &quot;{v.word}&quot; × {v.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.video_url ? (
        <video src={String(d.video_url)} controls className="mt-6 aspect-video w-full rounded-lg bg-black" />
      ) : d.hero_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(d.hero_image_url)} alt="" className="mt-6 aspect-video w-full rounded-lg object-cover" />
      ) : null}

      <section className="mt-8 space-y-6">
        <div>
          <h3 className="font-semibold text-slate-900">Excerpt PT</h3>
          <p className="mt-2 text-slate-700 text-sm">{String(d.excerpt_pt)}</p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Excerpt EN</h3>
          <p className="mt-2 text-slate-700 text-sm">{String(d.excerpt_en)}</p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Body PT</h3>
          <div className="mt-2 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{String(d.body_pt)}</div>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Body EN</h3>
          <div className="mt-2 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{String(d.body_en)}</div>
        </div>
      </section>

      {d.status === 'pending' && (
        <div className="mt-12 flex gap-3 border-t border-slate-200 pt-8">
          <form action={approveDraft}>
            <input type="hidden" name="id" value={String(d.id)} />
            <button
              type="submit"
              className="rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Aprovar e publicar
            </button>
          </form>
          <form action={rejectDraft} className="flex gap-2">
            <input type="hidden" name="id" value={String(d.id)} />
            <input
              name="reason"
              type="text"
              placeholder="Motivo (opcional)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm w-48"
            />
            <button
              type="submit"
              className="rounded-md bg-white px-5 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50"
            >
              Rejeitar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
