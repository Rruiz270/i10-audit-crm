import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT email, status, source, locale, created_at, confirmed_at,
           unsubscribed_at, signup_ip::text, consent_text_version
    FROM insights.subscribers
    ORDER BY created_at DESC
  `) as Array<Record<string, unknown>>;

  const header = [
    "email", "status", "source", "locale", "created_at", "confirmed_at",
    "unsubscribed_at", "signup_ip", "consent_text_version",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) => header.map((k) => escape(r[k])).join(",")),
  ];
  const csv = lines.join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="i10-insights-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
