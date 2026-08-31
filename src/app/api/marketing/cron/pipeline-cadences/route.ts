import type { NextRequest } from 'next/server';
import { runPipelineCadences } from '@/lib/marketing/pipeline-cadences';
import { beatHeartbeat, CADENCES_HEARTBEAT_KEY } from '@/lib/marketing/alerts';

// ─── /api/marketing/cron/pipeline-cadences ─────────────────────────────────
// Cron 1x/dia — deals "parados" (isRotten) disparam sequência de follow-up
// (WhatsApp/email) e tarefa de próxima melhor ação pro vendedor.
// Mesma proteção CRON_SECRET que /cron/drain.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runPipelineCadences();
  await beatHeartbeat(CADENCES_HEARTBEAT_KEY, { scanned: result.scanned, enrolled: result.enrolled });
  return Response.json(result);
}

export const POST = GET;
