// Server-side helper that builds the daily editorial brief.
// Reads scripts/manus-brief.txt at module-load time so we have ONE source
// of truth (cron + manual scripts both share the same prose).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEEKDAY_THEME: Record<number, { theme: string; category: string }> = {
  1: { theme: "Política & Equidade", category: "politica" },
  2: { theme: "Sala de Aula", category: "sala_de_aula" },
  3: { theme: "Pesquisa", category: "pesquisa" },
  4: { theme: "Ferramentas & LLMs", category: "ferramentas" },
  5: { theme: "Ética & Futuro", category: "etica" },
};

let CACHED_BRIEF: string | null = null;
function loadBrief(): string {
  if (CACHED_BRIEF != null) return CACHED_BRIEF;
  const path = join(process.cwd(), "scripts", "manus-brief.txt");
  CACHED_BRIEF = readFileSync(path, "utf8");
  return CACHED_BRIEF;
}

export function buildDailyBrief(date: Date = new Date()): {
  prompt: string;
  category: string;
} {
  const wd = date.getUTCDay();
  const wdMon15 = wd === 0 || wd === 6 ? 1 : wd; // weekend → Monday's theme
  const { theme, category } = WEEKDAY_THEME[wdMon15];
  const isoDate = date.toISOString().slice(0, 10);

  // Inject date + forced category at the top, then append the canonical brief.
  const header = `# CONTEXT — DAILY CRON

Today is ${isoDate}. The weekday theme is "${theme}" — set category="${category}" in the output regardless of what the story is about. Pick a story that fits this category.

`;
  return { prompt: header + loadBrief(), category };
}
