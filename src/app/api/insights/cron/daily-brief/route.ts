import { NextResponse } from "next/server";
import { buildDailyBrief } from "@/lib/insights/manus-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST handler: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
// We accept GET too (for manual trigger from a logged-in admin).
async function trigger(req: Request) {
  // 1. Auth — require either CRON_SECRET (Vercel Cron) or admin token (later)
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Build today's brief
  const { prompt, category } = buildDailyBrief();

  // 3. Fire the Manus task
  const KEY = process.env.MANUS_API_KEY;
  if (!KEY) {
    return NextResponse.json({ error: "MANUS_API_KEY missing" }, { status: 500 });
  }
  // Webhook do Manus aponta pro NOSSO app — handler está em
  // /api/insights/webhooks/manus (não no antigo /insights/api/webhooks/manus
  // que vivia no app i10-insights agora deprecated).
  const siteUrl = process.env.MARKETING_BASE_URL ?? "https://i10-audit-crm.vercel.app";
  const webhookUrl = `${siteUrl}/api/insights/webhooks/manus`;
  const r = await fetch("https://api.manus.ai/v1/tasks", {
    method: "POST",
    headers: { API_KEY: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      mode: "agent",
      webhook_url: webhookUrl,
      metadata: {
        source: "i10-insights-daily-cron",
        target_category: category,
        target_date: new Date().toISOString().slice(0, 10),
      },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return NextResponse.json(
      { error: "manus_create_failed", status: r.status, body: body.slice(0, 500) },
      { status: 502 },
    );
  }
  const task = (await r.json()) as { task_id?: string; id?: string };
  return NextResponse.json({
    ok: true,
    task_id: task.task_id ?? task.id,
    category,
    webhook_url: webhookUrl,
  });
}

export const GET = trigger;
export const POST = trigger;
