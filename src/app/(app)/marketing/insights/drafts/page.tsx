import Link from "next/link";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

interface DraftRow {
  id: string;
  status: string;
  category: string;
  created_at: string;
  title_pt: string;
  excerpt_pt: string;
  banned_word_hits: unknown;
  hero_image_url: string | null;
}

async function getDrafts(): Promise<DraftRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  return (await sql`
    SELECT id, status, category, created_at, title_pt, excerpt_pt,
           banned_word_hits, hero_image_url
    FROM insights.drafts
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `) as unknown as DraftRow[];
}

export default async function DraftsPage() {
  const drafts = await getDrafts();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between border-b border-gray-200 pb-6">
        <div>
          <Link
            href="/marketing/insights"
            className="text-xs font-semibold uppercase tracking-wider text-cyan hover:underline"
          >
            ← Admin
          </Link>
          <h1 className="mt-1 font-serif text-3xl text-navy">
            Drafts pendentes ({drafts.length})
          </h1>
        </div>
      </header>

      {drafts.length === 0 ? (
        <p className="mt-12 text-gray-500">Nenhum draft pendente no momento.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {drafts.map((d) => {
            const violations = Array.isArray(d.banned_word_hits)
              ? d.banned_word_hits.length
              : 0;
            return (
              <li
                key={d.id}
                className="rounded-xl border border-gray-200 bg-white p-6"
              >
                <div className="flex items-start gap-4">
                  {d.hero_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.hero_image_url}
                      alt=""
                      className="h-20 w-32 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan">
                      {d.category}
                      {violations > 0 && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          ⚠ {violations} banned
                        </span>
                      )}
                    </p>
                    <Link
                      href={`/marketing/insights/drafts/${d.id}`}
                      className="mt-1 block font-serif text-xl text-navy hover:underline"
                    >
                      {d.title_pt}
                    </Link>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {d.excerpt_pt}
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      {new Date(d.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
