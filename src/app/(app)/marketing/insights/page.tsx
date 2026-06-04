import Link from "next/link";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

interface Counts {
  draftsPending: number;
  draftsApproved: number;
  draftsPublished: number;
  draftsRejected: number;
  articlesTotal: number;
  articlesThisWeek: number;
  subscribersConfirmed: number;
  subscribersPending: number;
  subscribersUnsub: number;
  subscribersTotal: number;
  emailsLast7Days: number;
  lastCronAt: string | null;
}

async function getDashboardData(): Promise<{
  counts: Counts;
  recentDrafts: Array<{
    id: string;
    title_pt: string;
    category: string;
    created_at: string;
    banned_count: number;
  }>;
  recentSubs: Array<{
    email: string;
    status: string;
    locale: string;
    created_at: string;
  }>;
  cron: {
    lastDailyAt: string | null;
    lastDailyStatus: string | null;
    lastReminderAt: string | null;
  };
}> {
  const sql = neon(process.env.DATABASE_URL!);
  const [drafts] = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'approved') AS approved,
      count(*) FILTER (WHERE status = 'published') AS published,
      count(*) FILTER (WHERE status = 'rejected') AS rejected
    FROM insights.drafts
  `;
  const [arts] = await sql`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE published_at >= now() - interval '7 days') AS this_week
    FROM insights.articles
  `;
  const [subs] = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
      count(*) FILTER (WHERE status = 'pending_confirmation') AS pending,
      count(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribed,
      count(*) AS total
    FROM insights.subscribers
  `;
  const [emails] = await sql`
    SELECT count(*) AS sent
    FROM insights.email_log
    WHERE sent_at >= now() - interval '7 days'
  `;
  const [lastDraft] = await sql`
    SELECT max(created_at) AS at FROM insights.drafts
  `;
  const [lastDaily] = (await sql`
    SELECT created_at, status FROM insights.cron_log
    WHERE job = 'daily-brief' ORDER BY created_at DESC LIMIT 1
  `) as Array<{ created_at: string; status: string }>;
  const [lastReminder] = (await sql`
    SELECT created_at FROM insights.cron_log
    WHERE job = 'approval-reminder' ORDER BY created_at DESC LIMIT 1
  `) as Array<{ created_at: string }>;

  const recentDrafts = (await sql`
    SELECT id, title_pt, category, created_at,
           CASE WHEN banned_word_hits IS NULL THEN 0
                ELSE jsonb_array_length(banned_word_hits) END AS banned_count
    FROM insights.drafts
    WHERE status = 'pending'
    ORDER BY created_at DESC LIMIT 5
  `) as Array<{
    id: string;
    title_pt: string;
    category: string;
    created_at: string;
    banned_count: number;
  }>;

  const recentSubs = (await sql`
    SELECT email, status, locale, created_at
    FROM insights.subscribers
    ORDER BY created_at DESC LIMIT 8
  `) as Array<{
    email: string;
    status: string;
    locale: string;
    created_at: string;
  }>;

  return {
    counts: {
      draftsPending: Number(drafts.pending),
      draftsApproved: Number(drafts.approved),
      draftsPublished: Number(drafts.published),
      draftsRejected: Number(drafts.rejected),
      articlesTotal: Number(arts.total),
      articlesThisWeek: Number(arts.this_week),
      subscribersConfirmed: Number(subs.confirmed),
      subscribersPending: Number(subs.pending),
      subscribersUnsub: Number(subs.unsubscribed),
      subscribersTotal: Number(subs.total),
      emailsLast7Days: Number(emails.sent),
      lastCronAt: lastDraft.at,
    },
    recentDrafts,
    recentSubs,
    cron: {
      lastDailyAt: lastDaily?.created_at ?? null,
      lastDailyStatus: lastDaily?.status ?? null,
      lastReminderAt: lastReminder?.created_at ?? null,
    },
  };
}

export default async function AdminHome() {
  const { counts, recentDrafts, recentSubs, cron } = await getDashboardData();

  // Staleness: on a normal weekday the daily-brief cron should have run within
  // the last ~30h. No recent run (or never) means the pipeline is silently
  // broken — surface it loudly instead of letting it vanish.
  const lastDailyMs = cron.lastDailyAt ? Date.parse(cron.lastDailyAt) : null;
  const hoursSinceDaily =
    lastDailyMs != null ? (Date.now() - lastDailyMs) / 3_600_000 : null;
  const cronStale = hoursSinceDaily == null || hoursSinceDaily > 30;
  return (
    <main className="min-h-screen bg-off-white">
      <header className="bg-navy-dark text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-pale">
              i10 Insights
            </p>
            <h1 className="mt-1 font-serif text-2xl">Admin</h1>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/marketing/insights/audience"
              className="text-xs font-semibold uppercase tracking-wider text-cyan-pale hover:text-white"
            >
              Audiência →
            </Link>
            <Link
              href="https://i10-insights.vercel.app/pt" target="_blank"
              className="text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white"
            >
              ↗ Site público
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {/* KPI tiles */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            Métricas
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile
              href="/marketing/insights/drafts"
              label="Drafts aguardando"
              value={counts.draftsPending}
              sub={`${counts.draftsApproved} aprovados · ${counts.draftsRejected} rejeitados`}
              color={counts.draftsPending > 0 ? "text-cyan" : "text-gray-400"}
              accent={counts.draftsPending > 0}
            />
            <Tile
              href="/marketing/insights/drafts"
              label="Artigos publicados"
              value={counts.articlesTotal}
              sub={`${counts.articlesThisWeek} nos últimos 7 dias`}
              color="text-navy"
            />
            <Tile
              href="/marketing/insights/subscribers"
              label="Inscritos confirmados"
              value={counts.subscribersConfirmed}
              sub={`${counts.subscribersPending} aguardando · ${counts.subscribersUnsub} cancelados`}
              color="text-green-dark"
            />
            <Tile
              href="/marketing/insights/subscribers"
              label="E-mails enviados (7d)"
              value={counts.emailsLast7Days}
              sub={
                counts.lastCronAt
                  ? `Último draft: ${new Date(counts.lastCronAt).toLocaleString("pt-BR")}`
                  : "Nenhum draft ainda"
              }
              color="text-navy"
            />
          </div>
        </section>

        {/* Pending drafts preview */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan">
                Pendentes de aprovação
              </p>
              <p className="mt-1 font-serif text-lg text-navy">
                {recentDrafts.length === 0
                  ? "Nada na fila"
                  : `${counts.draftsPending} aguardando${counts.draftsPending > 5 ? ", mostrando os 5 mais recentes" : ""}`}
              </p>
            </div>
            <Link
              href="/marketing/insights/drafts"
              className="text-sm font-semibold text-navy hover:text-cyan"
            >
              Ver todos →
            </Link>
          </header>
          {recentDrafts.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-500">
              Nenhum draft pendente. O cron diário de 06:00 BRT vai gerar o
              próximo automaticamente.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentDrafts.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/marketing/insights/drafts/${d.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-off-white"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan">
                        {d.category}
                        {d.banned_count > 0 && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                            ⚠ {d.banned_count} banned
                          </span>
                        )}
                      </p>
                      <p className="mt-1 truncate font-serif text-base text-navy">
                        {d.title_pt}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {new Date(d.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent subscribers */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan">
                Inscritos recentes
              </p>
              <p className="mt-1 font-serif text-lg text-navy">
                {recentSubs.length} mostrados de {counts.subscribersTotal}
              </p>
            </div>
            <a
              href="/api/marketing/insights/subscribers.csv"
              className="text-sm font-semibold text-navy hover:text-cyan"
            >
              Export CSV →
            </a>
          </header>
          <ul className="divide-y divide-gray-100">
            {recentSubs.map((s) => (
              <li
                key={s.email}
                className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
              >
                <span className="truncate font-medium text-navy">{s.email}</span>
                <span className="flex-shrink-0 text-xs text-gray-500">
                  <StatusPill status={s.status} /> · {s.locale.toUpperCase()} ·{" "}
                  {new Date(s.created_at).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Cron health banner — only when something looks wrong */}
        {cronStale && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
            <p className="text-sm font-semibold text-red-700">
              ⚠ Geração diária parada
            </p>
            <p className="mt-1 text-sm text-red-600">
              {cron.lastDailyAt
                ? `Última execução do cron foi ${new Date(cron.lastDailyAt).toLocaleString("pt-BR")} (${Math.round(hoursSinceDaily!)}h atrás). O esperado é a cada dia útil às 06:00 BRT.`
                : "Nenhuma execução do cron registrada ainda. Verifique o path em vercel.json (deve incluir o basePath /insights) e o CRON_SECRET."}
            </p>
          </div>
        )}

        {/* System info */}
        <section className="grid gap-4 sm:grid-cols-3">
          <SmallTile
            label="Última geração (cron)"
            value={
              cron.lastDailyAt
                ? new Date(cron.lastDailyAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "nunca"
            }
            sub={
              cron.lastDailyAt
                ? `status: ${cron.lastDailyStatus ?? "?"} · 06:00 BRT seg-sex`
                : "cron nunca registrou execução"
            }
            color={cronStale ? "text-red-600" : "text-green-dark"}
          />
          <SmallTile
            label="Último reminder"
            value={
              cron.lastReminderAt
                ? new Date(cron.lastReminderAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "nunca"
            }
            sub="13:00 BRT · email se draft pendente"
          />
          <SmallTile
            label="ISR revalidate"
            value="5 min"
            sub="Hub e artigos refrescam automaticamente"
          />
        </section>
      </div>
    </main>
  );
}

function Tile({
  href,
  label,
  value,
  sub,
  color,
  accent,
}: {
  href: string;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border bg-white p-5 transition hover:border-cyan ${
        accent ? "border-cyan ring-2 ring-cyan/20" : "border-gray-200"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">
        {label}
      </p>
      <p className={`mt-2 font-serif text-3xl font-extrabold ${color ?? "text-navy"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </Link>
  );
}

function SmallTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">
        {label}
      </p>
      <p className={`mt-1 font-serif text-lg ${color ?? "text-navy"}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    confirmed: { bg: "bg-green-pale", text: "text-green-dark", label: "ativo" },
    pending_confirmation: {
      bg: "bg-cyan-pale",
      text: "text-navy",
      label: "pending",
    },
    unsubscribed: {
      bg: "bg-gray-100",
      text: "text-gray-500",
      label: "unsub",
    },
  };
  const s = map[status] ?? { bg: "bg-gray-100", text: "text-gray-500", label: status };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
