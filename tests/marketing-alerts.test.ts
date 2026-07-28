import { describe, expect, it } from 'vitest';
import {
  evaluateHealth,
  resolveAlertConfig,
  type HealthSnapshot,
} from '@/lib/marketing/alerts';

// evaluateHealth é pura (snapshot + config → issues) — testamos as regras de
// limiar sem banco. A coleta (collectHealthSnapshot) é SQL trivial de agregação.

const cfg = resolveAlertConfig({} as NodeJS.ProcessEnv);

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    deadJobsLastHour: 0,
    deadSampleError: null,
    stuckClaimedJobs: 0,
    pendingDueJobs: 0,
    oldestPendingAgeMinutes: null,
    drainLastRunAgeMinutes: 1,
    providerStats: [],
    webhookErrorsLastHour: 0,
    ...overrides,
  };
}

describe('resolveAlertConfig — defaults e overrides por env', () => {
  it('usa defaults quando env vazia', () => {
    expect(cfg.deadJobsThreshold).toBe(5);
    expect(cfg.drainStallMinutes).toBe(5);
    expect(cfg.providerErrorRate).toBe(0.25);
    expect(cfg.cooldownMinutes).toBe(30);
    expect(cfg.emails).toEqual([]);
    expect(cfg.whatsappNumbers).toEqual([]);
  });

  it('lê overrides e listas CSV', () => {
    const c = resolveAlertConfig({
      ALERTS_QUEUE_DEAD_THRESHOLD: '1',
      ALERTS_PROVIDER_ERROR_RATE: '0.5',
      ALERTS_EMAILS: 'a@i10.org, b@i10.org',
      ALERTS_WHATSAPP_TO: '+5511999999999',
    } as unknown as NodeJS.ProcessEnv);
    expect(c.deadJobsThreshold).toBe(1);
    expect(c.providerErrorRate).toBe(0.5);
    expect(c.emails).toEqual(['a@i10.org', 'b@i10.org']);
    expect(c.whatsappNumbers).toEqual(['+5511999999999']);
  });

  it('ignora valores inválidos (mantém defaults)', () => {
    const c = resolveAlertConfig({
      ALERTS_QUEUE_DEAD_THRESHOLD: 'abc',
      ALERTS_PROVIDER_ERROR_RATE: '7',
    } as unknown as NodeJS.ProcessEnv);
    expect(c.deadJobsThreshold).toBe(5);
    expect(c.providerErrorRate).toBe(0.25);
  });
});

describe('evaluateHealth — regras de limiar', () => {
  it('fila saudável → sem issues', () => {
    expect(evaluateHealth(snapshot(), cfg)).toEqual([]);
  });

  it('jobs dead acima do limiar → crítico, com último erro', () => {
    const issues = evaluateHealth(
      snapshot({ deadJobsLastHour: 5, deadSampleError: 'twilio:63003' }),
      cfg,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('queue_dead_jobs');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].detail).toContain('twilio:63003');
  });

  it('jobs dead abaixo do limiar → sem alerta', () => {
    expect(evaluateHealth(snapshot({ deadJobsLastHour: 4 }), cfg)).toEqual([]);
  });

  it('jobs presos em claimed → crítico', () => {
    const issues = evaluateHealth(snapshot({ stuckClaimedJobs: 3 }), cfg);
    expect(issues.map((i) => i.key)).toEqual(['queue_stuck_jobs']);
  });

  it('drain parado acima do limiar → crítico', () => {
    const issues = evaluateHealth(snapshot({ drainLastRunAgeMinutes: 6 }), cfg);
    expect(issues.map((i) => i.key)).toEqual(['drain_stalled']);
  });

  it('sem heartbeat E sem jobs pendentes → não alarma (deploy antes da migration)', () => {
    expect(evaluateHealth(snapshot({ drainLastRunAgeMinutes: null }), cfg)).toEqual([]);
  });

  it('sem heartbeat COM jobs pendentes → crítico', () => {
    const issues = evaluateHealth(
      snapshot({ drainLastRunAgeMinutes: null, pendingDueJobs: 12 }),
      cfg,
    );
    expect(issues.map((i) => i.key)).toEqual(['drain_stalled']);
  });

  it('backlog: job pendente vencido há muito tempo → warning', () => {
    const issues = evaluateHealth(
      snapshot({ oldestPendingAgeMinutes: 20, pendingDueJobs: 40 }),
      cfg,
    );
    expect(issues.map((i) => i.key)).toEqual(['queue_backlog']);
    expect(issues[0].severity).toBe('warning');
  });

  it('taxa de erro do provider: só alarma com amostra mínima', () => {
    // 3/5 falhas = 60% mas amostra < 10 → sem alerta
    const few = evaluateHealth(
      snapshot({ providerStats: [{ provider: 'twilio', total: 5, failed: 3, sampleError: null }] }),
      cfg,
    );
    expect(few).toEqual([]);

    // 5/20 = 25% com amostra 20 → crítico
    const issues = evaluateHealth(
      snapshot({
        providerStats: [
          { provider: 'twilio', total: 20, failed: 5, sampleError: 'twilio:63018' },
          { provider: 'brevo', total: 50, failed: 1, sampleError: null },
        ],
      }),
      cfg,
    );
    expect(issues.map((i) => i.key)).toEqual(['provider_error_rate:twilio']);
    expect(issues[0].title).toContain('twilio');
    expect(issues[0].detail).toContain('twilio:63018');
  });

  it('webhooks com erro acima do limiar → warning', () => {
    const issues = evaluateHealth(snapshot({ webhookErrorsLastHour: 5 }), cfg);
    expect(issues.map((i) => i.key)).toEqual(['webhook_errors']);
  });

  it('múltiplos problemas simultâneos → todas as issues', () => {
    const issues = evaluateHealth(
      snapshot({
        deadJobsLastHour: 10,
        drainLastRunAgeMinutes: 30,
        webhookErrorsLastHour: 9,
      }),
      cfg,
    );
    expect(issues.map((i) => i.key).sort()).toEqual([
      'drain_stalled',
      'queue_dead_jobs',
      'webhook_errors',
    ]);
  });
});
