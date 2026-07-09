// ─── Normalização de telefone brasileiro ────────────────────────────────────
// Fonte única de verdade para intake de formulários, backfills e a ponte de
// identidade crm↔marketing. Regras:
//   "(13) 99786-3585"  → +5513997863585
//   "13997863585"      → +5513997863585
//   "5513997863585"    → +5513997863585
//   "+55 13 99786-3585"→ +5513997863585
// Números não-plausíveis (menos de 10 dígitos) retornam null — melhor vazio
// que um lixo que o Twilio interpretaria como número internacional.

/** E.164 BR ou null se não-plausível. */
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let d = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !d.startsWith('55')) {
    // Número explicitamente internacional (não-BR): respeita como veio.
    return d.length >= 8 ? `+${d}` : null;
  }
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

/** Celular BR (tem 9º dígito) — só esses valem como WhatsApp por padrão. */
export function isBrMobile(e164: string | null): boolean {
  if (!e164) return false;
  const d = e164.replace(/\D/g, '');
  return d.startsWith('55') && d.length === 13 && d[4] === '9';
}

/** Chave de casamento por telefone: últimos 11 dígitos (DDD + 9 dígitos). */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(-11);
}
