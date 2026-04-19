'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Gate de senha pro formulário APM. Valida contra APM_GATEWAY_PASSWORD
 * (env var no Vercel), seta cookie HttpOnly por 30 dias, redireciona.
 *
 * Por que cookie e não session/JWT:
 *   · O gate é "shared secret" — não identifica usuário, só proteção zero-knowledge
 *   · Cookie HttpOnly: JavaScript não lê (anti-XSS)
 *   · Same-Site Lax: protege contra CSRF em forms normais
 *   · 30 dias: APM digita uma vez, pula na próxima
 */

const COOKIE_NAME = 'apm_gate';
const COOKIE_DAYS = 30;

export async function validateApmGate(formData: FormData) {
  const password = String(formData.get('password') ?? '').trim();
  const expected = process.env.APM_GATEWAY_PASSWORD ?? '';

  if (!expected) {
    return { ok: false as const, error: 'Sistema em configuração — contate o admin.' };
  }

  if (!password || password !== expected) {
    // Constant-time-ish delay para prevenir timing attacks (marginal em prod serverless
    // mas ajuda contra reuso de bot — 400-600ms random)
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));
    return { ok: false as const, error: 'Senha incorreta.' };
  }

  // Valida OK — seta cookie e redireciona
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: '1',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/apm',
    maxAge: COOKIE_DAYS * 24 * 3600,
  });

  redirect('/apm/cadastro');
}

/**
 * Chamado pela página /apm/cadastro para verificar se o cookie existe.
 * Se não, retorna `false` — a página redireciona pra /apm (gate).
 */
export async function hasApmGate(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value === '1';
}

/**
 * Utilitário pra admin/dev limpar o cookie (ex: testar o fluxo de novo).
 * Não está exposto na UI — disponível só via tooling.
 */
export async function clearApmGate() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect('/apm');
}
