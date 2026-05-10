import type { NextRequest } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/marketing/template-engine';
import { addSuppression } from '@/lib/marketing/suppression';

// ─── /api/marketing/unsubscribe — RFC 8058 One-Click endpoint ─────────────
// Gmail/Yahoo POSTam direto aqui (URL referenciada no header
// List-Unsubscribe). Devolvemos 200 logo após processar — sem UI.
//
// Note: a URL VISÍVEL no email (footer "Descadastrar") aponta pra /u/unsubscribe
// (com tela de confirmação). Este endpoint é APENAS pra clientes de email
// que respeitam RFC 8058 e fazem POST automático.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return processUnsubscribe(request);
}

// Alguns provedores fazem GET pra "verificar" antes — devolvemos 200 OK.
export async function GET(request: NextRequest) {
  return processUnsubscribe(request);
}

async function processUnsubscribe(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  if (!token) return new Response('missing token', { status: 400 });

  const secret = process.env.MARKETING_UNSUB_SECRET ?? 'dev-secret';
  const verification = verifyUnsubscribeToken(token, secret);
  if (!verification.ok) {
    return new Response(`invalid token: ${verification.reason}`, { status: 400 });
  }

  await addSuppression({
    identifier: verification.email,
    channel: 'email',
    reason: 'unsubscribe',
    sourceRef: 'one_click_unsubscribe',
    sourceIp: request.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    consentText: 'RFC 8058 List-Unsubscribe=One-Click',
  });

  return new Response('OK', { status: 200 });
}
