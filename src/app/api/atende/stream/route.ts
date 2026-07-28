import type { NextRequest } from 'next/server';
import { eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, userProjects } from '@/lib/schema-marketing';
import { getUser, type SessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/roles';
import { inboxEvents } from '@/lib/marketing/realtime';

// ─── /api/atende/stream — entrega em tempo real do inbox via SSE ──────────
// Substitui o polling de router.refresh() (que re-renderizava a rota RSC
// inteira a cada 6–8s). Aqui o servidor segura UMA conexão por cliente e roda
// uma única query-agregada barata de "cursor" por tick; só quando o cursor
// muda o cliente recebe `event: change` e aí sim faz router.refresh().
// O webhook do Twilio acorda o loop na hora via inboxEvents (mesma instância),
// então mensagens novas chegam quase instantaneamente.
//
// Query params:
//   ?list=1 — observa o inbox (conversas visíveis ao usuário, escopo F3)
//   ?c=123  — observa uma conversa específica (mensagens + status ✓/✓✓)
// O stream encerra sozinho antes do timeout da função; o EventSource do
// browser reconecta automaticamente.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const TICK_MS = 4000; // baseline de checagem do cursor (fallback do fast-path)
const HEARTBEAT_MS = 20000; // comentário keep-alive p/ proxies não matarem a conexão
const MAX_STREAM_MS = 270_000; // encerra antes do maxDuration; cliente reconecta

// Mesma regra de visibilidade F3 de conversations.ts (não exportável de lá:
// arquivo 'use server' só pode exportar actions): admin/gestor veem tudo;
// agente vê project_id ∈ memberships OR assigned_to = ele.
function visibilityWhere(user: SessionUser, projectIds: number[]): SQL | undefined {
  if (isAdmin(user.role)) return undefined;
  const clauses: SQL[] = [eq(conversations.assignedTo, user.id)];
  if (projectIds.length > 0) clauses.push(inArray(conversations.projectId, projectIds));
  return or(...clauses) ?? eq(conversations.id, -1);
}

// Fingerprint do inbox: 1 roundtrip, só agregados sobre conversas visíveis.
// Cobre mensagem nova (last_message_at), não-lidas, abre/fecha e claims.
async function inboxCursor(vis: SQL | undefined): Promise<string> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      lastMsg: sql<string>`coalesce(max(${conversations.lastMessageAt})::text, '')`,
      unread: sql<number>`count(*) filter (where ${conversations.unread})::int`,
      open: sql<number>`count(*) filter (where ${conversations.status} = 'open')::int`,
      claimed: sql<number>`count(*) filter (where ${conversations.assignedTo} is not null)::int`,
    })
    .from(conversations)
    .where(vis);
  return `${row.total}|${row.lastMsg}|${row.unread}|${row.open}|${row.claimed}`;
}

// Fingerprint de uma conversa: 1 roundtrip (join + agregados). Cobre mensagem
// nova, edição/soft-delete e transições de status de entrega (✓ → ✓✓ → lido).
async function conversationCursor(convId: number): Promise<string> {
  const [row] = await db
    .select({
      status: conversations.status,
      assignedTo: conversations.assignedTo,
      windowExpiresAt: sql<string>`coalesce(${conversations.windowExpiresAt}::text, '')`,
      total: sql<number>`count(${messages.id})::int`,
      lastCreated: sql<string>`coalesce(max(${messages.createdAt})::text, '')`,
      lastEdited: sql<string>`coalesce(max(${messages.editedAt})::text, '')`,
      deleted: sql<number>`count(*) filter (where ${messages.deletedAt} is not null)::int`,
      pending: sql<number>`count(*) filter (where ${messages.status} in ('queued','sending','sent'))::int`,
      delivered: sql<number>`count(*) filter (where ${messages.status} = 'delivered')::int`,
      seen: sql<number>`count(*) filter (where ${messages.status} = 'read')::int`,
      failed: sql<number>`count(*) filter (where ${messages.status} in ('failed','undelivered'))::int`,
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.id, convId))
    .groupBy(conversations.id);
  if (!row) return 'gone';
  return [
    row.status,
    row.assignedTo ?? '',
    row.windowExpiresAt,
    row.total,
    row.lastCreated,
    row.lastEdited,
    row.deleted,
    row.pending,
    row.delivered,
    row.seen,
    row.failed,
  ].join('|');
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const url = new URL(request.url);
  const convParam = url.searchParams.get('c');
  const includeList = url.searchParams.get('list') === '1';
  const convId = convParam ? Number(convParam) : null;
  if (convParam && !Number.isFinite(convId)) return new Response('bad request', { status: 400 });
  if (!includeList && convId == null) return new Response('bad request', { status: 400 });

  const admin = isAdmin(user.role);
  const projectIds = admin
    ? []
    : (
        await db
          .select({ projectId: userProjects.projectId })
          .from(userProjects)
          .where(eq(userProjects.userId, user.id))
      ).map((r) => r.projectId);

  // Checagem de acesso à conversa observada — uma vez, na abertura do stream.
  // 404 (e não 403) para não confirmar existência de id adivinhado.
  if (convId != null) {
    const [conv] = await db
      .select({ projectId: conversations.projectId, assignedTo: conversations.assignedTo })
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);
    const canSee =
      conv &&
      (admin ||
        conv.assignedTo === user.id ||
        (conv.projectId != null && projectIds.includes(conv.projectId)));
    if (!canSee) return new Response('not found', { status: 404 });
  }

  const vis = visibilityWhere(user, projectIds);
  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // cliente já desconectou — o loop encerra pelo signal.aborted
        }
      };
      send('retry: 3000\n\n');

      // Fast-path: o webhook emite 'change' e o loop acorda sem esperar o tick.
      let wake: (() => void) | null = null;
      let pending = false;
      const onChange = (changedConv: number | null) => {
        const relevant = includeList || changedConv == null || changedConv === convId;
        if (relevant) {
          pending = true;
          wake?.();
        }
      };
      inboxEvents.on('change', onChange);

      const startedAt = Date.now();
      let lastCursor: string | null = null;
      let lastBeat = Date.now();

      try {
        while (!signal.aborted && Date.now() - startedAt < MAX_STREAM_MS) {
          pending = false;
          let cursor = '';
          try {
            if (includeList) cursor += await inboxCursor(vis);
            if (convId != null) cursor += `§${await conversationCursor(convId)}`;
          } catch (err) {
            // falha transitória de DB: não derruba o stream, tenta no próximo tick
            console.error('[atende/stream] erro ao computar cursor:', err);
            cursor = '';
          }
          if (cursor) {
            // primeiro cursor é só baseline (a página acabou de renderizar fresca)
            if (lastCursor !== null && cursor !== lastCursor) {
              send(`event: change\ndata: {}\n\n`);
              lastBeat = Date.now();
            }
            lastCursor = cursor;
          }
          if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            send(': hb\n\n');
            lastBeat = Date.now();
          }
          if (pending) continue; // mudança chegou enquanto consultávamos o banco
          await new Promise<void>((resolve) => {
            const timer = setTimeout(done, TICK_MS);
            function done() {
              clearTimeout(timer);
              wake = null;
              signal.removeEventListener('abort', done);
              resolve();
            }
            wake = done;
            signal.addEventListener('abort', done, { once: true });
          });
        }
      } finally {
        inboxEvents.off('change', onChange);
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
