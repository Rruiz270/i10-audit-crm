import { beforeEach, describe, expect, it, vi } from 'vitest';
import { suppressions, consentLog, contacts } from '@/lib/schema-marketing';

// ─── Mock do db — supressão é a última linha de defesa LGPD antes do envio ──
// Capturamos selects (fila de resultados), inserts, updates e deletes pra
// afirmar canonicalização, idempotência e o audit trail em consent_log.

const h = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[],
    selectCount: 0,
    inserts: [] as { table: unknown; values: Record<string, unknown>; conflictTarget?: unknown }[],
    updates: [] as { table: unknown; values: Record<string, unknown> }[],
    deletes: [] as { table: unknown }[],
  };
  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
    return chain;
  };
  const db = {
    select: () => {
      state.selectCount += 1;
      return selectChain();
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const entry: { table: unknown; values: Record<string, unknown>; conflictTarget?: unknown } = {
          table,
          values,
        };
        state.inserts.push(entry);
        return Object.assign(Promise.resolve(), {
          onConflictDoNothing: (opts?: { target?: unknown }) => {
            entry.conflictTarget = opts?.target;
            return Promise.resolve();
          },
        });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        state.deletes.push({ table });
        return Promise.resolve();
      },
    }),
  };
  return { state, db };
});

vi.mock('@/lib/db', () => ({ db: h.db }));

import {
  addSuppression,
  batchIsSuppressed,
  isSuppressed,
  removeSuppression,
} from '@/lib/marketing/suppression';

function suppressionInsert() {
  return h.state.inserts.find((i) => i.table === suppressions);
}

function consentInsert() {
  return h.state.inserts.find((i) => i.table === consentLog);
}

beforeEach(() => {
  h.state.selectResults = [];
  h.state.selectCount = 0;
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
});

describe('isSuppressed', () => {
  it('true quando existe linha de supressão, false quando não', async () => {
    h.state.selectResults.push([{ id: 1 }]);
    expect(await isSuppressed('ana@example.com')).toBe(true);
    h.state.selectResults.push([]);
    expect(await isSuppressed('bob@example.com')).toBe(false);
  });
});

describe('batchIsSuppressed', () => {
  it('devolve os identifiers ORIGINAIS dos suprimidos (não a forma canônica)', async () => {
    h.state.selectResults.push([{ identifier: 'ana@example.com' }]);
    const set = await batchIsSuppressed(['  Ana@Example.COM ', 'bob@example.com']);
    expect(set).toEqual(new Set(['  Ana@Example.COM ']));
  });

  it('lista vazia devolve Set vazio sem consultar o banco', async () => {
    expect(await batchIsSuppressed([])).toEqual(new Set());
    expect(h.state.selectCount).toBe(0);
  });
});

describe('addSuppression — canonicalização', () => {
  it('email é trimmed + lowercase antes de gravar', async () => {
    await addSuppression({ identifier: '  Ana@EXAMPLE.com ', channel: 'email', reason: 'unsubscribe' });
    expect(suppressionInsert()?.values.identifier).toBe('ana@example.com');
    expect(consentInsert()?.values.identifier).toBe('ana@example.com');
  });

  it('whatsapp vira phone: + dígitos (formatação removida)', async () => {
    await addSuppression({
      identifier: '+55 (11) 99999-8888',
      channel: 'whatsapp',
      reason: 'unsubscribe',
    });
    expect(suppressionInsert()?.values.identifier).toBe('phone:+5511999998888');
  });

  it('whatsapp já canônico (prefixo phone:) é mantido como está', async () => {
    await addSuppression({ identifier: 'phone:+5511999998888', channel: 'whatsapp', reason: 'manual' });
    expect(suppressionInsert()?.values.identifier).toBe('phone:+5511999998888');
  });
});

describe('addSuppression — efeitos por reason (LGPD)', () => {
  it('unsubscribe: insert idempotente + contact unsubscribed + consent_log opt_out via unsubscribe_link', async () => {
    await addSuppression({
      identifier: 'ana@example.com',
      channel: 'email',
      reason: 'unsubscribe',
      sourceIp: '1.2.3.4',
      consentText: 'Você foi descadastrado.',
    });

    // Idempotência: re-clicar o link de descadastro não pode dar erro 500
    expect(suppressionInsert()?.conflictTarget).toEqual([suppressions.identifier, suppressions.channel]);

    const contactUpdate = h.state.updates.find((u) => u.table === contacts);
    expect(contactUpdate?.values.status).toBe('unsubscribed');

    expect(consentInsert()?.values).toMatchObject({
      action: 'opt_out',
      legalBasis: 'opt_out',
      source: 'unsubscribe_link',
      sourceIp: '1.2.3.4',
      consentText: 'Você foi descadastrado.',
    });
  });

  it('bounce_hard: contact bounced e origem webhook no audit trail', async () => {
    await addSuppression({ identifier: 'ana@example.com', channel: 'email', reason: 'bounce_hard' });
    expect(h.state.updates.find((u) => u.table === contacts)?.values.status).toBe('bounced');
    expect(consentInsert()?.values).toMatchObject({ action: 'opt_out', source: 'webhook' });
  });

  it('complaint: contact complained', async () => {
    await addSuppression({ identifier: 'ana@example.com', channel: 'email', reason: 'complaint' });
    expect(h.state.updates.find((u) => u.table === contacts)?.values.status).toBe('complained');
  });

  it('lgpd_request: consent_log registra data_delete_request (LGPD art. 18)', async () => {
    await addSuppression({ identifier: 'ana@example.com', channel: 'email', reason: 'lgpd_request' });
    expect(consentInsert()?.values.action).toBe('data_delete_request');
  });

  it('canal whatsapp não mexe no status do contact (só email tem esse vínculo)', async () => {
    await addSuppression({ identifier: '+5511999998888', channel: 'whatsapp', reason: 'unsubscribe' });
    expect(h.state.updates.filter((u) => u.table === contacts)).toHaveLength(0);
    expect(consentInsert()).toBeDefined();
  });
});

describe('removeSuppression', () => {
  it('remove da tabela de supressões (ação admin, sem consent_log automático)', async () => {
    await removeSuppression('ana@example.com', 'email');
    expect(h.state.deletes).toEqual([{ table: suppressions }]);
    expect(h.state.inserts).toHaveLength(0);
  });
});
