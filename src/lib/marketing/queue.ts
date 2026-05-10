import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { queueJobs } from '../schema-marketing';

// ─── Queue ──────────────────────────────────────────────────────────────
// Padrão canônico Postgres: FOR UPDATE SKIP LOCKED + UPDATE + RETURNING.
// Permite N workers (ex: cron disparando múltiplas instâncias) competirem
// pela queue sem deadlock. Cada um claim N jobs disponíveis e processa.
//
// Drizzle não expõe SKIP LOCKED nativo — usamos sql`` template raw.
// Mantemos a query inline aqui pra ficar visível e auditável.

export type JobType =
  | 'send_email'
  | 'send_whatsapp'
  | 'process_webhook'
  | 'advance_sequence';

export type ClaimedJob = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  rateBucket: string | null;
};

// Claim N jobs prontos pra processar. NÃO bloqueia — outros workers ficam
// livres pra claim os próximos. Devolve jobs já em status 'claimed'.
export async function claimJobs(limit: number = 30): Promise<ClaimedJob[]> {
  // Usar sql.raw com bound params seria ideal mas Drizzle template literal
  // já parametriza ${} — então `sql` é seguro contra injection aqui.
  const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id FROM marketing.queue_jobs
      WHERE status = 'pending' AND run_at <= NOW()
      ORDER BY run_at, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE marketing.queue_jobs q
    SET status = 'claimed',
        claimed_at = NOW(),
        attempts = q.attempts + 1
    FROM claimed
    WHERE q.id = claimed.id
    RETURNING q.id, q.type, q.payload, q.attempts, q.max_attempts, q.rate_bucket
  `);

  // neon-http retorna { rows: [...] }
  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
  return rows.map((r) => ({
    id: Number(r.id),
    type: String(r.type),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    rateBucket: r.rate_bucket as string | null,
  }));
}

// Marca job como concluído (sucesso final).
export async function completeJob(jobId: number): Promise<void> {
  await db
    .update(queueJobs)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(queueJobs.id, jobId));
}

// Falha — decide se reenfileira ou manda pra dead-letter.
// Backoff exponencial: 30s, 2min, 8min, 32min...
export async function failJob(
  jobId: number,
  attempts: number,
  maxAttempts: number,
  errorMessage: string,
  retryable: boolean,
): Promise<void> {
  const isDead = !retryable || attempts >= maxAttempts;
  if (isDead) {
    await db
      .update(queueJobs)
      .set({
        status: 'dead',
        completedAt: new Date(),
        lastError: errorMessage.slice(0, 1000),
      })
      .where(eq(queueJobs.id, jobId));
  } else {
    const backoffSeconds = Math.min(30 * Math.pow(4, attempts - 1), 60 * 60); // cap 1h
    const nextRun = new Date(Date.now() + backoffSeconds * 1000);
    await db
      .update(queueJobs)
      .set({
        status: 'pending',
        runAt: nextRun,
        lastError: errorMessage.slice(0, 1000),
        // claimed_at fica preenchido — útil pra debug ("foi pego e reagendado")
      })
      .where(eq(queueJobs.id, jobId));
  }
}

// Enqueue helper — usado por server actions ao lançar campanha.
export async function enqueueJob(input: {
  type: JobType;
  payload: Record<string, unknown>;
  runAt?: Date;
  rateBucket?: string;
  maxAttempts?: number;
}): Promise<number> {
  const inserted = await db
    .insert(queueJobs)
    .values({
      type: input.type,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      rateBucket: input.rateBucket,
      maxAttempts: input.maxAttempts ?? 3,
    })
    .returning({ id: queueJobs.id });
  return inserted[0].id;
}

// Bulk enqueue — usado quando campanha lança 10k jobs de uma vez.
// Insere em chunks pra não estourar Postgres parameter limit (~64k).
export async function bulkEnqueueJobs(
  jobs: Array<{
    type: JobType;
    payload: Record<string, unknown>;
    runAt?: Date;
    rateBucket?: string;
  }>,
  chunkSize = 500,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    const chunk = jobs.slice(i, i + chunkSize);
    const result = await db
      .insert(queueJobs)
      .values(
        chunk.map((j) => ({
          type: j.type,
          payload: j.payload,
          runAt: j.runAt ?? new Date(),
          rateBucket: j.rateBucket,
          maxAttempts: 3,
        })),
      )
      .returning({ id: queueJobs.id });
    total += result.length;
  }
  return total;
}

// Estatísticas — usado em dashboard e endpoint de health
export async function getQueueStats(): Promise<{
  pending: number;
  claimed: number;
  completed: number;
  dead: number;
  oldestPendingAt: Date | null;
}> {
  const result = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int as count,
      MIN(run_at) FILTER (WHERE status = 'pending') as oldest_pending
    FROM marketing.queue_jobs
    GROUP BY status
  `);
  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
  const stats = {
    pending: 0,
    claimed: 0,
    completed: 0,
    dead: 0,
    oldestPendingAt: null as Date | null,
  };
  for (const r of rows) {
    const status = String(r.status);
    const count = Number(r.count);
    if (status in stats && status !== 'oldestPendingAt') {
      (stats as unknown as Record<string, number>)[status] = count;
    }
    if (status === 'pending' && r.oldest_pending) {
      stats.oldestPendingAt = new Date(String(r.oldest_pending));
    }
  }
  return stats;
}

// Limpeza — remove jobs completed/dead com mais de N dias pra controlar tamanho da tabela.
// Roda diário via cron separado.
export async function gcOldJobs(olderThanDays = 30): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM marketing.queue_jobs
    WHERE status IN ('completed', 'dead')
      AND completed_at < NOW() - INTERVAL '${sql.raw(String(olderThanDays))} days'
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
