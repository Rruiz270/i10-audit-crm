import type { NextRequest } from 'next/server';
import { runQueueHealthCheck } from '@/lib/marketing/alerts';
import { getQueueStats } from '@/lib/marketing/queue';

// ─── /api/marketing/health ─────────────────────────────────────────────────
// Snapshot de saúde do motor de envios: fila (pending/claimed/dead), heartbeat
// do cron drain, taxa de erro por provider e webhooks com erro. Só leitura —
// a notificação do time acontece no cron recover (a cada 5 min).
//
// Auth: Authorization: Bearer <CRON_SECRET> (mesmo esquema dos crons) — o
// snapshot expõe contagens operacionais e mensagens de erro de providers.
//
// Uso: curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/marketing/health

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  return (request.headers.get('authorization') ?? '') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [health, queue] = await Promise.all([
    runQueueHealthCheck({ notify: false }),
    getQueueStats(),
  ]);

  return Response.json(
    {
      healthy: health.healthy,
      issues: health.issues,
      snapshot: health.snapshot,
      queue,
    },
    // 503 quando doente — permite plugar uptime monitor (Better Stack, UptimeRobot…)
    { status: health.healthy ? 200 : 503 },
  );
}
