// Trava de segurança de ambiente: quando MARKETING_TEST_ALLOWLIST_PHONE está
// definida, só os números listados podem receber WhatsApp. Serve para que um
// ambiente de teste apontando para a base real não dispare para ninguém de
// verdade — por isso TODO caminho outbound precisa consultá-la, inclusive os
// automáticos.

export function blockedByTestAllowlist(phone: string): boolean {
  const allow = process.env.MARKETING_TEST_ALLOWLIST_PHONE;
  if (!allow) return false;
  const digits = phone.replace(/\D/g, '');
  const ok = allow
    .split(',')
    .map((s) => s.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .some((a) => digits.endsWith(a) || a.endsWith(digits));
  return !ok;
}
