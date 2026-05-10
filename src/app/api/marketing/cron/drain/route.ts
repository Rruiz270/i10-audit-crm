import type { NextRequest } from 'next/server';
import { claimJobs, completeJob, failJob } from '@/lib/marketing/queue';
import { dispatchJob } from '@/lib/marketing/send-pipeline';

// ─── /api/marketing/cron/drain ────────────────────────────────────────────
// Endpoint chamado pelo Vercel Cron. Drena queue em batches paralelos.
//
// Vercel Cron envia automaticamente:
//   Authorization: Bearer <process.env.CRON_SECRET>
// Bloqueamos requests sem esse header pra evitar abuse externo.
//
// Comportamento:
//   - Claim N jobs (limit ajustável via ?limit=)
//   - Roda em batches de PARALLEL_BATCH (default 10) — Promise.allSettled
//   - Cada job vira complete/fail baseado no handler
//
// Vercel Cron mínimo: 1 minuto (Pro). Hobby: 5 min.
// Timeout: Hobby 10s, Pro 60s, Enterprise 900s.
// Pra 30 emails/min com batch paralelo de 10: ~3-5s por execução.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const PARALLEL_BATCH = 10;

function isAuthorized(request: NextRequest): boolean {
  // Em dev, permitir sem auth se CRON_SECRET não estiver definido (facilita teste local).
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT), 100);

  const start = Date.now();
  const jobs = await claimJobs(limit);

  if (jobs.length === 0) {
    return Response.json({
      claimed: 0,
      completed: 0,
      failed: 0,
      durationMs: Date.now() - start,
    });
  }

  let completed = 0;
  let failed = 0;
  const errors: Array<{ jobId: number; error: string }> = [];

  // Processa em sub-batches paralelos pra throughput sem estourar limites
  for (let i = 0; i < jobs.length; i += PARALLEL_BATCH) {
    const batch = jobs.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        try {
          const result = await dispatchJob(job);
          if (result.ok) {
            await completeJob(job.id);
            return { ok: true, jobId: job.id };
          }
          await failJob(job.id, job.attempts, job.maxAttempts, result.error, result.retryable);
          return { ok: false, jobId: job.id, error: result.error };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await failJob(job.id, job.attempts, job.maxAttempts, message, true);
          return { ok: false, jobId: job.id, error: message };
        }
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.ok) completed += 1;
        else {
          failed += 1;
          errors.push({ jobId: r.value.jobId, error: r.value.error ?? 'unknown' });
        }
      } else {
        failed += 1;
      }
    }
  }

  return Response.json({
    claimed: jobs.length,
    completed,
    failed,
    durationMs: Date.now() - start,
    // Limita a 5 erros pra resposta não estourar
    errors: errors.slice(0, 5),
  });
}

// POST com mesma lógica — Vercel Cron usa GET por padrão mas algumas configs usam POST
export const POST = GET;
