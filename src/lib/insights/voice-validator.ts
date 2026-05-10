// Brandbook voice enforcement.
// Hard-fail words come from /Users/raphaelruiz/Downloads/IMPROVED-BRANDBOOK-i10.html
// (Tom de Voz section, "Palavras que evitamos").

const BANNED = [
  "revolucionário",
  "revolucionária",
  "revolucionários",
  "revolucionárias",
  "incrível",
  "incríveis",
  "disruptivo",
  "disruptiva",
  "game-changer",
  "game changer",
  "solução mágica",
  "soluções mágicas",
  "único no mundo",
  "perfeito",
  "perfeita",
  "garantido",
  "garantida",
  "instantâneo",
  "instantânea",
  "viral",
  // English equivalents
  "revolutionary",
  "groundbreaking",
  "game-changing",
  "magical solution",
  "one of a kind",
  "perfect",
  "guaranteed",
  "instantaneous",
] as const;

export interface ValidationResult {
  passed: boolean;
  violations: Array<{ word: string; count: number; field: string }>;
}

export function validateVoice(
  fields: Record<string, string>,
): ValidationResult {
  const violations: ValidationResult["violations"] = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const word of BANNED) {
      // Whole-word boundary check; handle hyphens and unicode.
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`,
        "giu",
      );
      const matches = lower.match(re);
      if (matches && matches.length > 0) {
        violations.push({ word, count: matches.length, field });
      }
    }
  }
  return { passed: violations.length === 0, violations };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
