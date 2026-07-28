import type { NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { runQueueHealthCheck } from '@/lib/marketing/alerts';
import { captureError } from '@/lib/observability';

// ─── /api/marketing/cron/recover ───────────────────────────────────────────
// Auto-recovery: re-enfileira sends que ficaram 'queued' mas cujo job morreu
// (dead) ou sumiu — tipicamente vítimas de throttle do provider (Graph 429).
// Roda a cada 5 min (Vercel Cron). Espaça os re-enqueues p/ não re-estourar.
//
// Auth: Authorization: Bearer <CRON_SECRET> (igual ao drain).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STALE_MINUTES = 3;   // só recupera o que está parado há >3 min
const MAX_PER_RUN = 80;    // teto por execução
const SPACING_SEC = 10;    // 10s entre cada (~6/min) — gentil com o Graph

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  return (request.headers.get('authorization') ?? '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sql = neon(process.env.DATABASE_URL!);

  // sends presos: status 'queued', antigos, SEM job vivo (pending/processing)
  const stuck = (await sql`
    SELECT s.id
    FROM marketing.sends s
    WHERE s.status = 'queued'
      AND s.queued_at < now() - (${STALE_MINUTES} || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM marketing.queue_jobs q
        WHERE q.type = 'send_email'
          AND q.status IN ('pending', 'processing')
          AND (q.payload->>'sendId')::int = s.id
      )
    ORDER BY s.id
    LIMIT ${MAX_PER_RUN}
  `) as Array<{ id: number }>;

  let requeued = 0;
  for (const s of stuck) {
    await sql`
      INSERT INTO marketing.queue_jobs (type, payload, status, run_at, attempts, max_attempts, rate_bucket)
      VALUES ('send_email', ${JSON.stringify({ sendId: s.id })}::jsonb, 'pending',
              now() + (${requeued * SPACING_SEC} || ' seconds')::interval, 0, 3, 'msgraph')
    `;
    requeued++;
  }

  // Health check do motor de envios pega carona aqui (a cada 5 min): fila
  // dead/stuck, drain parado, taxa de erro de provider e webhooks com erro.
  // Notifica o time (e-mail/WhatsApp) com cooldown. Best-effort: nunca pode
  // impedir a recuperação de sends acima.
  let health: Awaited<ReturnType<typeof runQueueHealthCheck>> | null = null;
  try {
    health = await runQueueHealthCheck({ notify: true });
  } catch (err) {
    captureError(err, { area: 'cron:recover' });
  }

  return Response.json({
    ok: true,
    recovered: requeued,
    scannedStuck: stuck.length,
    health: health
      ? { healthy: health.healthy, issues: health.issues, notified: health.notifiedKeys }
      : null,
  });
}
