import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BANNED = [
  "revolucionário", "revolucionária", "incrível", "disruptivo", "disruptiva",
  "game-changer", "solução mágica", "único no mundo", "perfeito", "garantido",
  "instantâneo", "viral", "revolutionary", "groundbreaking", "game-changing",
];

interface ManusTask {
  id?: string;
  task_id?: string;
  status: string;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

function extractJson(task: ManusTask): Record<string, unknown> | null {
  const out = task.output;
  if (!Array.isArray(out)) return null;
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m?.role !== "assistant") continue;
    const blocks = (m.content as Array<{ text?: string; content?: string }>) ?? [];
    for (let j = blocks.length - 1; j >= 0; j--) {
      const text = blocks[j].text ?? blocks[j].content ?? "";
      if (!text) continue;
      try { return JSON.parse(text); } catch {}
      const m2 = text.match(/\{[\s\S]*\}/);
      if (m2) { try { return JSON.parse(m2[0]); } catch {} }
    }
  }
  return null;
}

function bannedHits(article: Record<string, unknown>): Array<{ field: string; word: string; count: number }> {
  const fields = ["title_pt", "title_en", "excerpt_pt", "excerpt_en", "body_pt", "body_en"];
  const out: Array<{ field: string; word: string; count: number }> = [];
  for (const f of fields) {
    const text = String(article[f] ?? "").toLowerCase();
    for (const w of BANNED) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
      const hits = text.match(re);
      if (hits) out.push({ field: f, word: w, count: hits.length });
    }
  }
  return out;
}

const VALID_CATEGORIES = ["politica", "sala_de_aula", "pesquisa", "ferramentas", "etica"];

export async function POST(req: Request) {
  // Manus webhook payload shape isn't documented in detail; we accept whatever
  // comes in and re-fetch the task via API to get fresh, trusted state.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = payload as { task_id?: string; id?: string; task?: { id?: string; task_id?: string } };
  const taskId = data.task_id ?? data.id ?? data.task?.id ?? data.task?.task_id;
  if (!taskId) {
    return NextResponse.json({ error: "missing_task_id" }, { status: 400 });
  }

  // Re-fetch the task using OUR API key — this both authenticates the source
  // (only our key can fetch the task) and gives us the trusted, current state.
  const KEY = process.env.MANUS_API_KEY;
  if (!KEY) {
    return NextResponse.json({ error: "MANUS_API_KEY missing" }, { status: 500 });
  }
  const r = await fetch(`https://api.manus.ai/v1/tasks/${taskId}`, {
    headers: { API_KEY: KEY },
  });
  if (!r.ok) {
    return NextResponse.json({ error: "fetch_failed", status: r.status }, { status: 502 });
  }
  const task = (await r.json()) as ManusTask;

  if (task.status !== "completed") {
    return NextResponse.json({ ok: true, ignored: `status=${task.status}` });
  }

  const article = extractJson(task);
  if (!article) {
    return NextResponse.json({ error: "no_json_in_output" }, { status: 422 });
  }

  // Validate required fields
  const required = ["category", "title_pt", "title_en", "slug_pt", "slug_en", "excerpt_pt", "excerpt_en", "body_pt", "body_en"];
  const missing = required.filter((k) => !article[k]);
  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_fields", missing }, { status: 422 });
  }
  if (!VALID_CATEGORIES.includes(String(article.category))) {
    return NextResponse.json({ error: "invalid_category", got: article.category }, { status: 422 });
  }

  const violations = bannedHits(article);

  // Insert into drafts (NOT articles — needs human approval before publish)
  const sql = neon(process.env.DATABASE_URL!);
  const inserted = await sql`
    INSERT INTO insights.drafts (
      manus_task_id, category,
      title_pt, title_en, slug_pt, slug_en,
      excerpt_pt, excerpt_en, body_pt, body_en,
      hero_image_url, hero_image_alt_pt, hero_image_alt_en,
      video_url, citations, banned_word_hits
    ) VALUES (
      ${taskId}, ${String(article.category)},
      ${String(article.title_pt)}, ${String(article.title_en)},
      ${String(article.slug_pt)}, ${String(article.slug_en)},
      ${String(article.excerpt_pt)}, ${String(article.excerpt_en)},
      ${String(article.body_pt)}, ${String(article.body_en)},
      ${(article.hero_image_url as string) ?? null},
      ${(article.hero_image_alt_pt as string) ?? null},
      ${(article.hero_image_alt_en as string) ?? null},
      ${(article.video_url as string) ?? null},
      ${JSON.stringify(article.citations ?? [])}::jsonb,
      ${violations.length > 0 ? JSON.stringify(violations) : null}::jsonb
    )
    RETURNING id, status, slug_pt
  `;

  return NextResponse.json({
    ok: true,
    draft_id: inserted[0].id,
    slug_pt: inserted[0].slug_pt,
    banned_violations: violations.length,
  });
}
