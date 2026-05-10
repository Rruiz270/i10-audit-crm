import type { NextRequest } from 'next/server';
import { runSequences } from '@/lib/marketing/sequence-runner';

// ─── /api/marketing/cron/sequences ────────────────────────────────────────
// Cron 1x/min — avança sequence_members elegíveis (next_send_at <= NOW).
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
  const result = await runSequences();
  return Response.json(result);
}

export const POST = GET;
