import Link from "next/link";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SubRow {
  id: string;
  email: string;
  status: string;
  source: string | null;
  locale: string;
  created_at: string;
  confirmed_at: string | null;
}

interface Props {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
    page?: string;
  }>;
}

async function getSubscribers(filters: {
  q?: string;
  status?: string;
  source?: string;
  page: number;
}): Promise<{ rows: SubRow[]; total: number }> {
  const sql = neon(process.env.DATABASE_URL!);
  const offset = (filters.page - 1) * PAGE_SIZE;

  // Build WHERE conditions dynamically with $N placeholders
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.q) {
    conditions.push(`email ILIKE $${idx}`);
    params.push(`%${filters.q}%`);
    idx++;
  }
  if (filters.status) {
    conditions.push(`status = $${idx}`);
    params.push(filters.status);
    idx++;
  }
  if (filters.source) {
    conditions.push(`source = $${idx}`);
    params.push(filters.source);
    idx++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query
  const countResult = await sql.query(
    `SELECT COUNT(*)::int AS total FROM insights.subscribers ${whereClause}`,
    params,
  );
  const total = (countResult[0]?.total as number) ?? 0;

  // Data query
  const dataResult = await sql.query(
    `SELECT id, email, status, source, locale, created_at, confirmed_at
     FROM insights.subscribers
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, PAGE_SIZE, offset],
  );

  return { rows: dataResult as unknown as SubRow[], total };
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-pale text-green-dark",
  pending_confirmation: "bg-cyan-pale text-navy",
  unsubscribed: "bg-gray-200 text-gray-600",
  bounced: "bg-red-100 text-red-700",
  complained: "bg-red-100 text-red-700",
};

const SOURCE_STYLES: Record<string, string> = {
  organic: "bg-cyan-pale text-navy",
  invite: "bg-green-pale text-green-dark",
  "bncc-computacao": "bg-navy text-white",
};

function buildHref(
  base: Record<string, string>,
  overrides: Record<string, string>,
) {
  const merged = { ...base, ...overrides };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v),
  );
  const qs = new URLSearchParams(clean).toString();
  return `/marketing/insights/subscribers${qs ? `?${qs}` : ""}`;
}

export default async function SubscribersPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q ?? "";
  const statusFilter = params.status ?? "";
  const sourceFilter = params.source ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { rows: subs, total } = await getSubscribers({
    q: q || undefined,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (statusFilter) baseParams.status = statusFilter;
  if (sourceFilter) baseParams.source = sourceFilter;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="border-b border-gray-200 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/marketing/insights"
              className="text-xs font-semibold uppercase tracking-wider text-cyan hover:underline"
            >
              &larr; Admin
            </Link>
            <h1 className="mt-1 font-serif text-3xl text-navy">
              Inscritos ({total})
            </h1>
          </div>
          <a
            href="/api/marketing/insights/subscribers.csv"
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-dark"
          >
            Export CSV
          </a>
        </div>

        {/* Filters */}
        <form
          method="GET"
          action="/marketing/insights/subscribers"
          className="mt-6 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Buscar e-mail
            </label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="nome@exemplo.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Status
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
            >
              <option value="">Todos</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending_confirmation">Pending</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="bounced">Bounced</option>
              <option value="complained">Complained</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Source
            </label>
            <select
              name="source"
              defaultValue={sourceFilter}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
            >
              <option value="">Todos</option>
              <option value="organic">Organic</option>
              <option value="invite">Invite</option>
              <option value="bncc-computacao">BNCC Computacao</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-navy hover:brightness-110"
          >
            Filtrar
          </button>
          {(q || statusFilter || sourceFilter) && (
            <Link
              href="/marketing/insights/subscribers"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Limpar
            </Link>
          )}
        </form>
      </header>

      <table className="mt-8 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="pb-3">Email</th>
            <th className="pb-3">Status</th>
            <th className="pb-3">Source</th>
            <th className="pb-3">Locale</th>
            <th className="pb-3">Cadastrado</th>
            <th className="pb-3">Confirmado</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-t border-gray-100">
              <td className="max-w-[240px] truncate py-3" title={s.email}>
                {s.email}
              </td>
              <td className="py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[s.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {s.status}
                </span>
              </td>
              <td className="py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    SOURCE_STYLES[s.source ?? "organic"] ??
                    "bg-gray-100 text-gray-600"
                  }`}
                >
                  {s.source ?? "organic"}
                </span>
              </td>
              <td className="py-3 text-gray-500">{s.locale}</td>
              <td className="py-3 text-gray-500">
                {new Date(s.created_at).toLocaleDateString("pt-BR")}
              </td>
              <td className="py-3 text-gray-500">
                {s.confirmed_at
                  ? new Date(s.confirmed_at).toLocaleDateString("pt-BR")
                  : "—"}
              </td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 text-center text-gray-400">
                Nenhum inscrito encontrado com esses filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-500">
            Pagina {page} de {totalPages} &middot; {total} inscritos
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(baseParams, {
                  page: String(page - 1),
                })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                &larr; Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(baseParams, {
                  page: String(page + 1),
                })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Proximo &rarr;
              </Link>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
