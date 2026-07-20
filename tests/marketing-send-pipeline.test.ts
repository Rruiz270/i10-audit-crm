import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campaigns, sends } from '@/lib/schema-marketing';
import type { EmailSendInput, EmailSendResult } from '@/lib/marketing/providers/types';

// ─── Mocks — db, suppression e providers ──────────────────────────────────
// O send-pipeline fala com o mundo por 3 portas: db (drizzle), suppression e
// provider factory. Mockando as três, testamos toda a lógica do handler
// (idempotência, allowlist, suppression, transições de status) sem banco.

const h = vi.hoisted(() => {
  const state = {
    // Fila de resultados: cada `await db.select()...` consome um item.
    selectResults: [] as unknown[],
    updates: [] as { table: unknown; values: Record<string, unknown> }[],
  };
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'where', 'limit', 'orderBy']) {
      chain[m] = () => chain;
    }
    chain.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
    return chain;
  };
  const db = {
    select: () => selectChain(),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  };
  return {
    state,
    db,
    isSuppressed: vi.fn(async () => false),
    addSuppression: vi.fn(async () => {}),
    providerSend: vi.fn(
      async (input: unknown): Promise<{ ok: boolean } & Record<string, unknown>> => {
        void input;
        return { ok: true, providerId: 'msg-1', provider: 'brevo' };
      },
    ),
  };
});

vi.mock('@/lib/db', () => ({ db: h.db }));
vi.mock('@/lib/marketing/suppression', () => ({
  isSuppressed: h.isSuppressed,
  addSuppression: h.addSuppression,
}));
vi.mock('@/lib/marketing/providers', () => ({
  getEmailProvider: () => ({ name: 'brevo', send: h.providerSend, getRateLimits: () => null }),
  getWhatsAppProvider: () => ({ name: 'twilio', send: h.providerSend }),
}));

import { handleSendEmail } from '@/lib/marketing/send-pipeline';

function joinedRow(overrides: {
  send?: Record<string, unknown>;
  campaign?: Record<string, unknown>;
  template?: Record<string, unknown>;
  contact?: Record<string, unknown>;
} = {}) {
  return {
    send: {
      id: 1,
      status: 'queued',
      toEmail: null,
      mergeVars: { nome: 'Ana' },
      trackingToken: 'tok-abc',
      ...overrides.send,
    },
    campaign: { id: 10, provider: null, ...overrides.campaign },
    template: {
      id: 5,
      subject: 'Olá {{nome}}',
      html: '<html><body>Oi {{nome}}</body></html>',
      ...overrides.template,
    },
    contact: { name: 'Ana', email: 'ana@example.com', ...overrides.contact },
  };
}

function sendUpdates() {
  return h.state.updates.filter((u) => u.table === sends).map((u) => u.values);
}

beforeEach(() => {
  h.state.selectResults = [];
  h.state.updates = [];
  h.isSuppressed.mockClear();
  h.isSuppressed.mockResolvedValue(false);
  h.providerSend.mockClear();
  h.providerSend.mockResolvedValue({ ok: true, providerId: 'msg-1', provider: 'brevo' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('handleSendEmail', () => {
  it('rejeita payload sem sendId (não-retryable)', async () => {
    const result = await handleSendEmail({});
    expect(result).toEqual({ ok: false, error: 'missing sendId in payload', retryable: false });
    expect(h.providerSend).not.toHaveBeenCalled();
  });

  it('é idempotente: send já enviado retorna ok sem chamar o provider', async () => {
    h.state.selectResults.push([joinedRow({ send: { status: 'sent' } })]);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: true });
    expect(h.providerSend).not.toHaveBeenCalled();
    expect(h.state.updates).toHaveLength(0);
  });

  it('marca como failed quando não há email no send nem no contato', async () => {
    h.state.selectResults.push([joinedRow({ contact: { email: null } })]);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(sendUpdates()).toEqual([
      expect.objectContaining({ status: 'failed', errorMessage: 'no email address on send/contact' }),
    ]);
    expect(h.providerSend).not.toHaveBeenCalled();
  });

  it('não envia para email suprimido (re-check pós-enqueue)', async () => {
    h.state.selectResults.push([joinedRow()]);
    h.isSuppressed.mockResolvedValue(true);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: true });
    expect(h.providerSend).not.toHaveBeenCalled();
    expect(sendUpdates()).toEqual([expect.objectContaining({ status: 'failed' })]);
  });

  it('MARKETING_TEST_ALLOWLIST bloqueia qualquer destinatário fora da lista', async () => {
    vi.stubEnv('MARKETING_TEST_ALLOWLIST', 'teste@i10.org');
    h.state.selectResults.push([joinedRow()]);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: true });
    expect(h.providerSend).not.toHaveBeenCalled();
    const [update] = sendUpdates();
    expect(update.status).toBe('failed');
    expect(String(update.errorMessage)).toContain('blocked_test_mode');
  });

  it('MARKETING_TEST_ALLOWLIST libera destinatário na lista (case-insensitive)', async () => {
    vi.stubEnv('MARKETING_TEST_ALLOWLIST', 'ANA@EXAMPLE.COM, outro@x.com');
    h.state.selectResults.push([joinedRow()]);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: true });
    expect(h.providerSend).toHaveBeenCalledTimes(1);
  });

  it('sucesso: status sending → sent, providerId gravado e sentCount incrementado', async () => {
    h.state.selectResults.push([joinedRow()]);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: true });

    const input = h.providerSend.mock.calls[0][0] as EmailSendInput;
    expect(input.to.email).toBe('ana@example.com');
    expect(input.subject).toBe('Olá Ana');
    expect(input.headers?.['X-Send-Id']).toBe('1');

    expect(sendUpdates()).toEqual([
      expect.objectContaining({ status: 'sending' }),
      expect.objectContaining({ status: 'sent', providerId: 'msg-1', provider: 'brevo' }),
    ]);
    const campaignUpdates = h.state.updates.filter((u) => u.table === campaigns);
    expect(campaignUpdates).toHaveLength(1);
    expect(campaignUpdates[0].values).toHaveProperty('sentCount');
  });

  it('falha retryable do provider devolve o send pra fila (status queued)', async () => {
    h.state.selectResults.push([joinedRow()]);
    const failure: EmailSendResult = {
      ok: false,
      error: 'rate limited',
      retryable: true,
      provider: 'brevo',
    };
    h.providerSend.mockResolvedValue(failure);
    const result = await handleSendEmail({ sendId: 1 });
    expect(result).toEqual({ ok: false, error: 'rate limited', retryable: true });
    expect(sendUpdates()).toEqual([
      expect.objectContaining({ status: 'sending' }),
      expect.objectContaining({ status: 'queued', errorMessage: 'rate limited' }),
    ]);
  });
});
