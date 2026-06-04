import Link from "next/link";
import { notFound } from "next/navigation";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

async function getDraft(id: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT * FROM insights.drafts WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export default async function DraftDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDraft(id);
  if (!d) notFound();

  const violations = Array.isArray(d.banned_word_hits) ? d.banned_word_hits : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/marketing/insights/drafts"
        className="text-xs font-semibold uppercase tracking-wider text-cyan hover:underline"
      >
        ← Drafts
      </Link>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-cyan">
        {String(d.category)} · status: {String(d.status)}
      </p>
      <h1 className="mt-2 font-serif text-3xl text-navy">{String(d.title_pt)}</h1>
      <h2 className="mt-2 font-serif text-xl italic text-gray-500">
        {String(d.title_en)}
      </h2>

      {violations.length > 0 && (
        <div className="mt-6 rounded-md bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <p className="font-semibold">⚠ Banned words detected:</p>
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
        <video
          src={String(d.video_url)}
          controls
          className="mt-6 aspect-[16/9] w-full rounded-lg bg-black"
        />
      ) : d.hero_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={String(d.hero_image_url)}
          alt=""
          className="mt-6 aspect-[16/9] w-full rounded-lg object-cover"
        />
      ) : null}

      <section className="mt-8">
        <h3 className="font-serif text-lg text-navy">Excerpt PT</h3>
        <p className="mt-2 text-gray-700">{String(d.excerpt_pt)}</p>
        <h3 className="mt-6 font-serif text-lg text-navy">Excerpt EN</h3>
        <p className="mt-2 text-gray-700">{String(d.excerpt_en)}</p>
      </section>

      <section className="mt-8">
        <h3 className="font-serif text-lg text-navy">Body PT</h3>
        <div className="mt-2 text-gray-800 leading-7">
          {String(d.body_pt).split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mt-4">
              {p}
            </p>
          ))}
        </div>
        <h3 className="mt-8 font-serif text-lg text-navy">Body EN</h3>
        <div className="mt-2 text-gray-800 leading-7">
          {String(d.body_en).split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mt-4">
              {p}
            </p>
          ))}
        </div>
      </section>

      {d.status === "pending" && (
        <div className="mt-12 rounded-lg border border-cyan bg-cyan-pale/20 p-6">
          <p className="text-sm font-semibold text-navy">
            Aprovação / rejeição (fase 2)
          </p>
          <p className="mt-1 text-sm text-gray-600">
            As ações de aprovar (dispara e-mails) e pedir revisão ao Manus ainda
            rodam no app Insights original, para não duplicar o engine de envio.
            Use o link abaixo para agir neste draft com segurança.
          </p>
          <a
            href={`https://i10-insights.vercel.app/admin/drafts/${String(d.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-light"
          >
            Abrir no Insights para aprovar/rejeitar ↗
          </a>
        </div>
      )}
    </main>
  );
}
