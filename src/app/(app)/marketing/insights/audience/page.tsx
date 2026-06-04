import Link from "next/link";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Human labels for the machine role keys.
const ROLE_LABEL: Record<string, string> = {
  prefeito: "Prefeito(a)",
  prefeitura: "Prefeitura",
  gabinete: "Prefeitura",
  educacao: "Sec. Educação",
  inscrito: "Inscrito",
  lead: "Lead",
};

// Human labels for the machine source keys.
const SOURCE_LABEL: Record<string, string> = {
  "bncc-webinar": "BNCC Computação — inscritos",
  "apm-fundeb-webinar": "APM/FUNDEB — inscritos",
  "report-downloads": "Downloads de relatório",
  "file-prefeitos-br": "Prefeitos BR (base)",
  "file-paraiba": "Paraíba consolidado",
  "file-brasil-edu": "Prefeituras + Educação BR",
};

interface Filters {
  source: string;
  uf: string;
  role: string;
  q: string;
  page: number;
}

function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return {
    source: one(sp.source),
    uf: one(sp.uf).toUpperCase(),
    role: one(sp.role),
    q: one(sp.q),
    page: Math.max(1, parseInt(one(sp.page) || "1", 10) || 1),
  };
}

async function load(f: Filters) {
  const sql = neon(process.env.DATABASE_URL!);

  // KPI counts (unfiltered) + per-source breakdown.
  const [kpi] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
      count(*) FILTER (WHERE phone IS NOT NULL)::int AS with_phone,
      count(*) FILTER (WHERE consent IS TRUE)::int AS with_consent,
      count(DISTINCT uf)::int AS ufs
    FROM audience.contacts
  `;
  const perSource = (await sql`
    SELECT source, count(*)::int AS n FROM audience.contacts GROUP BY source ORDER BY n DESC
  `) as Array<{ source: string; n: number }>;
  const ufList = (await sql`
    SELECT uf, count(*)::int AS n FROM audience.contacts
    WHERE uf IS NOT NULL GROUP BY uf ORDER BY uf
  `) as Array<{ uf: string; n: number }>;

  // Filtered, paginated rows — dynamic WHERE via parameterized query.
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("?", `$${params.length}`));
  };
  if (f.source) add("source = ?", f.source);
  if (f.uf) add("uf = ?", f.uf);
  if (f.role) add("role = ?", f.role);
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    where.push(`(name ILIKE ${p} OR email ILIKE ${p} OR municipio ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [{ n: matched }] = (await sql.query(
    `SELECT count(*)::int AS n FROM audience.contacts ${whereSql}`,
    params,
  )) as unknown as Array<{ n: number }>;

  const rows = (await sql.query(
    `SELECT name, role, email, phone, municipio, uf, source, segment, consent, created_at
     FROM audience.contacts ${whereSql}
     ORDER BY uf NULLS LAST, municipio NULLS LAST, role, name
     LIMIT ${PAGE_SIZE} OFFSET ${(f.page - 1) * PAGE_SIZE}`,
    params,
  )) as unknown as Array<{
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    municipio: string | null;
    uf: string | null;
    source: string;
    segment: string | null;
    consent: boolean | null;
    created_at: string;
  }>;

  return { kpi, perSource, ufList, rows, matched };
}

function qs(f: Filters, override: Partial<Filters>): string {
  const m = { ...f, ...override };
  const p = new URLSearchParams();
  if (m.source) p.set("source", m.source);
  if (m.uf) p.set("uf", m.uf);
  if (m.role) p.set("role", m.role);
  if (m.q) p.set("q", m.q);
  if (m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const { kpi, perSource, ufList, rows, matched } = await load(f);
  const totalPages = Math.max(1, Math.ceil(matched / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-off-white">
      <header className="bg-navy-dark text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-pale">
              i10 Insights · Audiência
            </p>
            <h1 className="mt-1 font-serif text-2xl">Base consolidada de contatos</h1>
          </div>
          <Link
            href="/marketing/insights"
            className="text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Kpi label="Total de contatos" value={kpi.total} accent />
          <Kpi label="Com e-mail" value={kpi.with_email} />
          <Kpi label="Com telefone" value={kpi.with_phone} />
          <Kpi label="Opt-in (consent)" value={kpi.with_consent} color="text-green-dark" />
          <Kpi label="UFs cobertas" value={kpi.ufs} />
        </section>

        {/* Per-source chips */}
        <section className="flex flex-wrap gap-2">
          <SourceChip f={f} value="" label="Todas as origens" n={kpi.total} />
          {perSource.map((s) => (
            <SourceChip
              key={s.source}
              f={f}
              value={s.source}
              label={SOURCE_LABEL[s.source] ?? s.source}
              n={s.n}
            />
          ))}
        </section>

        {/* Filters */}
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <input type="hidden" name="source" value={f.source} />
          <Field label="Busca (nome, e-mail, município)">
            <input
              name="q"
              defaultValue={f.q}
              placeholder="ex: prefeitura, joão, recife…"
              className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="UF">
            <select name="uf" defaultValue={f.uf} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Todas</option>
              {ufList.map((u) => (
                <option key={u.uf} value={u.uf}>
                  {u.uf} ({u.n})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select name="role" defaultValue={f.role} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="prefeito">Prefeito</option>
              <option value="prefeitura">Prefeitura/Gabinete</option>
              <option value="educacao">Educação</option>
              <option value="inscrito">Inscrito (webinar)</option>
              <option value="lead">Lead (download)</option>
            </select>
          </Field>
          <button className="rounded-lg bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-dark">
            Filtrar
          </button>
          <Link href="/marketing/insights/audience" className="px-2 py-2 text-sm text-gray-500 hover:text-navy">
            Limpar
          </Link>
        </form>

        {/* Result count */}
        <p className="text-sm text-gray-600">
          <strong className="text-navy">{matched.toLocaleString("pt-BR")}</strong> contatos
          {f.source || f.uf || f.role || f.q ? " (filtrados)" : ""} · página {f.page} de {totalPages}
        </p>

        {/* Table */}
        <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Município</th>
                <th className="px-4 py-3">UF</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Opt-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    Nenhum contato com esses filtros.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-off-white">
                  <td className="px-4 py-3 font-medium text-navy">{r.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {r.role ? ROLE_LABEL[r.role] ?? r.role : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.municipio ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.uf ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-cyan-pale px-2 py-0.5 text-[11px] text-navy">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.consent === true ? (
                      <span className="text-green-dark">✓</span>
                    ) : r.consent === false ? (
                      <span className="text-gray-400">✕</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Pagination */}
        <nav className="flex items-center justify-between">
          {f.page > 1 ? (
            <Link
              href={`/marketing/insights/audience${qs(f, { page: f.page - 1 })}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-cyan"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          {f.page < totalPages ? (
            <Link
              href={`/marketing/insights/audience${qs(f, { page: f.page + 1 })}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-cyan"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  accent,
  color,
}: {
  label: string;
  value: number;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 ${accent ? "border-cyan ring-2 ring-cyan/20" : "border-gray-200"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">{label}</p>
      <p className={`mt-2 font-serif text-3xl font-extrabold ${color ?? "text-navy"}`}>
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function SourceChip({
  f,
  value,
  label,
  n,
}: {
  f: Filters;
  value: string;
  label: string;
  n: number;
}) {
  const active = f.source === value;
  return (
    <Link
      href={`/marketing/insights/audience${qs({ ...f, page: 1 }, { source: value })}`}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active ? "border-navy bg-navy text-white" : "border-gray-300 bg-white text-navy hover:border-cyan"
      }`}
    >
      {label} <span className={active ? "text-cyan-pale" : "text-gray-400"}>· {n.toLocaleString("pt-BR")}</span>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  );
}
