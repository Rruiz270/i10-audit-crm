import type { NextRequest } from 'next/server';
import { getInboxLatest } from '@/lib/actions/marketing/conversations';

// ─── /api/marketing/conversations/latest ───────────────────────────────────
// Endpoint delta do auto-refresh do inbox/atende: devolve só o
// max(last_message_at) visível pro caller (ou de uma conversa, com
// ?conversationId=). O InboxAutoRefresh compara com o valor anterior e só
// re-renderiza a rota (router.refresh) quando algo mudou — corta o re-fetch
// RSC completo a cada 8s (invocações Vercel + compute Neon).
//
// Visibilidade: getInboxLatest reusa as regras F3 (papel/fila) do módulo de
// conversas — sem sessão responde 401, sem acesso responde latest: null.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('conversationId');
  const conversationId = raw == null ? undefined : Number(raw);
  if (conversationId !== undefined && !Number.isInteger(conversationId)) {
    return new Response('bad request', { status: 400 });
  }
  try {
    const latest = await getInboxLatest(conversationId);
    return Response.json({ latest });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return new Response('unauthorized', { status: 401 });
    }
    throw e;
  }
}
