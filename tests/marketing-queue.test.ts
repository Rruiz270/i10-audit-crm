import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock do db — a máquina de estados da queue vive em SQL/updates ────────
// claimJobs usa db.execute (sql raw com SKIP LOCKED); completeJob/failJob usam
// db.update. Capturamos ambos pra afirmar as transições de status sem banco.

const h = vi.hoisted(() => {
  const state = {
    executeResults: [] as unknown[],
    executeCalls: [] as unknown[],
    updates: [] as { values: Record<string, unknown> }[],
  };
  const db = {
    execute: (query: unknown) => {
      state.executeCalls.push(query);
      return Promise.resolve(state.executeResults.shift() ?? { rows: [] });
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ values });
          return Promise.resolve();
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock('@/lib/db', () => ({ db: h.db }));

import { claimJobs, completeJob, failJob } from '@/lib/marketing/queue';

const NOW = new Date('2026-07-27T12:00:00.000Z');

beforeEach(() => {
  h.state.executeResults = [];
  h.state.executeCalls = [];
  h.state.updates = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function runAtOffsetSeconds(values: Record<string, unknown>): number {
  return ((values.runAt as Date).getTime() - NOW.getTime()) / 1000;
}

describe('claimJobs', () => {
  it('mapeia as rows do Postgres (snake_case/strings) pra ClaimedJob tipado', async () => {
    h.state.executeResults.push({
      rows: [
        {
          id: '7',
          type: 'send_email',
          payload: { sendId: 1 },
          attempts: '1',
          max_attempts: '3',
          rate_bucket: 'email:brevo',
        },
      ],
    });
    const jobs = await claimJobs(10);
    expect(jobs).toEqual([
      {
        id: 7,
        type: 'send_email',
        payload: { sendId: 1 },
        attempts: 1,
        maxAttempts: 3,
        rateBucket: 'email:brevo',
      },
    ]);
  });

  it('payload null vira objeto vazio e queue vazia devolve []', async () => {
    h.state.executeResults.push({
      rows: [
        { id: 1, type: 'send_whatsapp', payload: null, attempts: 1, max_attempts: 3, rate_bucket: null },
      ],
    });
    expect((await claimJobs())[0].payload).toEqual({});
    expect(await claimJobs()).toEqual([]);
  });

  it('claim é atômico multi-worker: SKIP LOCKED, só jobs pending e attempts incrementado', async () => {
    await claimJobs(5);
    const query = JSON.stringify(h.state.executeCalls[0]);
    expect(query).toContain('FOR UPDATE SKIP LOCKED');
    expect(query).toContain("status = 'pending'");
    expect(query).toContain('attempts = q.attempts + 1');
  });
});

describe('completeJob', () => {
  it('marca o job como completed com timestamp', async () => {
    await completeJob(42);
    expect(h.state.updates).toHaveLength(1);
    expect(h.state.updates[0].values).toEqual({ status: 'completed', completedAt: NOW });
  });
});

describe('failJob — máquina de estados', () => {
  it('erro não-retryable vai direto pra dead, mesmo com attempts sobrando', async () => {
    await failJob(1, 1, 3, 'destinatário inválido', false);
    expect(h.state.updates[0].values).toMatchObject({
      status: 'dead',
      lastError: 'destinatário inválido',
      completedAt: NOW,
    });
  });

  it('esgotar maxAttempts manda pra dead-letter mesmo sendo retryable', async () => {
    await failJob(1, 3, 3, 'timeout', true);
    expect(h.state.updates[0].values).toMatchObject({ status: 'dead' });
  });

  it('lastError é truncado em 1000 chars (não estoura a coluna)', async () => {
    await failJob(1, 3, 3, 'x'.repeat(1500), true);
    expect(String(h.state.updates[0].values.lastError)).toHaveLength(1000);
  });

  it('falha retryable reenfileira como pending com backoff exponencial 30s → 2min → 8min', async () => {
    await failJob(1, 1, 3, 'rate limited', true);
    await failJob(1, 2, 3, 'rate limited', true);
    const [first, second] = h.state.updates.map((u) => u.values);
    expect(first).toMatchObject({ status: 'pending', lastError: 'rate limited' });
    expect(runAtOffsetSeconds(first)).toBe(30);
    expect(runAtOffsetSeconds(second)).toBe(120);
  });

  it('backoff tem teto de 1h', async () => {
    await failJob(1, 8, 10, 'ainda saturado', true);
    expect(runAtOffsetSeconds(h.state.updates[0].values)).toBe(3600);
  });

  it('retryAfterSeconds do provider sobrepõe o exponencial (ex.: janela de 24h da Meta)', async () => {
    await failJob(1, 1, 3, 'tier saturado', true, 86_400);
    expect(h.state.updates[0].values).toMatchObject({ status: 'pending' });
    expect(runAtOffsetSeconds(h.state.updates[0].values)).toBe(86_400);
  });
});
