import { sql } from 'drizzle-orm';
import { db } from '../db';
import { opsAlertState, opsHeartbeats } from '../schema-marketing';
import { captureError, captureMessage } from '../observability';
import { getEmailProvider, getWhatsAppProvider } from './providers';

// ─── Alertas de saúde do motor de envios ───────────────────────────────────
// Vigia a fila (marketing.queue_jobs), o cron drain e os providers, e avisa
// o time quando algo trava — hoje falha de envio morre em console.log e leads
// se perdem sem ninguém saber.
//
// Checks (limiares via env, defaults abaixo):
//   - jobs 'dead' (dead-letter) na última hora acima do limiar
//   - jobs presos em 'claimed' (worker crashou no meio — nunca re-tentados)
//   - cron drain sem executar há N minutos (heartbeat em ops_heartbeats)
//   - backlog: job pending vencido esperando há N minutos
//   - taxa de erro por provider (Twilio/Brevo/SES/MSGraph) nos últimos 30 min
//   - webhooks com status 'error' na última hora
//
// Quem roda: cron recover (a cada 5 min) e GET /api/marketing/health.
// Notificação: e-mail (ALERTS_EMAILS) + WhatsApp interno (ALERTS_WHATSAPP_TO),
// com cooldown por alerta (ops_alert_state) pra não spammar a cada check.
// Tudo best-effort: NADA aqui pode derrubar o cron que pegou carona.

const PROVIDER_WINDOW_MINUTES = 30;
const DEAD_WINDOW_MINUTES = 60;
const STUCK_CLAIMED_MINUTES = 15;
const WEBHOOK_WINDOW_MINUTES = 60;

// Chaves de heartbeat dos crons do motor. A Agenda de Jobs (painel de Agentes)
// lê marketing.ops_heartbeats pra saber se o cron REALMENTE rodou: a API da
// Vercel entrega só a agenda, nunca a execução. Sem batida, o painel mostra
// "sem telemetria" — melhor que um verde que não prova nada.
// Convenção: 'cron:<último segmento do path>' — o monitor deriva a chave assim.
export const DRAIN_HEARTBEAT_KEY = 'cron:drain';
export const SEQUENCES_HEARTBEAT_KEY = 'cron:sequences';
export const RECOVER_HEARTBEAT_KEY = 'cron:recover';
export const CADENCES_HEARTBEAT_KEY = 'cron:pipeline-cadences';

export type AlertConfig = {
  deadJobsThreshold: number;
  stuckClaimedThreshold: number;
  drainStallMinutes: number;
  backlogMinutes: number;
  providerMinSample: number;
  providerErrorRate: number; // 0..1
  webhookErrorThreshold: number;
  cooldownMinutes: number;
  emails: string[];
  whatsappNumbers: string[];
};

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function csvEnv(env: NodeJS.ProcessEnv, key: string): string[] {
  return (env[key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig {
  const rate = Number(env.ALERTS_PROVIDER_ERROR_RATE);
  return {
    deadJobsThreshold: intEnv(env, 'ALERTS_QUEUE_DEAD_THRESHOLD', 5),
    stuckClaimedThreshold: intEnv(env, 'ALERTS_QUEUE_STUCK_THRESHOLD', 3),
    drainStallMinutes: intEnv(env, 'ALERTS_DRAIN_STALL_MINUTES', 5),
    backlogMinutes: intEnv(env, 'ALERTS_QUEUE_BACKLOG_MINUTES', 15),
    providerMinSample: intEnv(env, 'ALERTS_PROVIDER_MIN_SAMPLE', 10),
    providerErrorRate: Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 0.25,
    webhookErrorThreshold: intEnv(env, 'ALERTS_WEBHOOK_ERROR_THRESHOLD', 5),
    cooldownMinutes: intEnv(env, 'ALERTS_COOLDOWN_MINUTES', 30),
    emails: csvEnv(env, 'ALERTS_EMAILS'),
    whatsappNumbers: csvEnv(env, 'ALERTS_WHATSAPP_TO'),
  };
}

export type ProviderStat = {
  provider: string;
  total: number;
  failed: number;
  sampleError: string | null;
};

export type HealthSnapshot = {
  deadJobsLastHour: number;
  deadSampleError: string | null;
  stuckClaimedJobs: number;
  pendingDueJobs: number;
  oldestPendingAgeMinutes: number | null;
  /** null = sem heartbeat registrado (tabela nova ou drain nunca rodou) */
  drainLastRunAgeMinutes: number | null;
  providerStats: ProviderStat[];
  webhookErrorsLastHour: number;
};

export type HealthIssue = {
  key: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
};

// Regras puras (sem IO) — cobertas por tests/marketing-alerts.test.ts.
export function evaluateHealth(s: HealthSnapshot, cfg: AlertConfig): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (s.deadJobsLastHour >= cfg.deadJobsThreshold) {
    issues.push({
      key: 'queue_dead_jobs',
      severity: 'critical',
      title: `${s.deadJobsLastHour} job(s) mortos (dead-letter) na última hora`,
      detail:
        `Limiar: ${cfg.deadJobsThreshold}. Envios descartados após esgotar retries — leads não receberão a mensagem.` +
        (s.deadSampleError ? ` Último erro: ${s.deadSampleError}` : ''),
    });
  }

  if (s.stuckClaimedJobs >= cfg.stuckClaimedThreshold) {
    issues.push({
      key: 'queue_stuck_jobs',
      severity: 'critical',
      title: `${s.stuckClaimedJobs} job(s) presos em 'claimed' há mais de ${STUCK_CLAIMED_MINUTES} min`,
      detail:
        'Worker crashou entre claim e complete/fail — esses jobs nunca serão re-tentados sem intervenção manual (marketing.queue_jobs).',
    });
  }

  if (s.drainLastRunAgeMinutes === null) {
    // Sem heartbeat: só alarma se há trabalho esperando (evita falso positivo
    // logo após o deploy, antes da migration/primeira execução do drain).
    if (s.pendingDueJobs > 0) {
      issues.push({
        key: 'drain_stalled',
        severity: 'critical',
        title: `Cron drain sem heartbeat com ${s.pendingDueJobs} job(s) pendentes`,
        detail: 'Nenhuma execução do drain registrada em ops_heartbeats. Verificar Vercel Cron e CRON_SECRET.',
      });
    }
  } else if (s.drainLastRunAgeMinutes >= cfg.drainStallMinutes) {
    issues.push({
      key: 'drain_stalled',
      severity: 'critical',
      title: `Cron drain sem executar há ${s.drainLastRunAgeMinutes} min`,
      detail: `Limiar: ${cfg.drainStallMinutes} min (cron roda a cada 1 min). Verificar Vercel Cron, deploy e CRON_SECRET.`,
    });
  }

  if (s.oldestPendingAgeMinutes !== null && s.oldestPendingAgeMinutes >= cfg.backlogMinutes) {
    issues.push({
      key: 'queue_backlog',
      severity: 'warning',
      title: `Backlog na fila: job pendente esperando há ${s.oldestPendingAgeMinutes} min`,
      detail: `Limiar: ${cfg.backlogMinutes} min. ${s.pendingDueJobs} job(s) vencidos — drain parado ou sem dar vazão.`,
    });
  }

  for (const p of s.providerStats) {
    if (p.total >= cfg.providerMinSample && p.failed / p.total >= cfg.providerErrorRate) {
      issues.push({
        key: `provider_error_rate:${p.provider}`,
        severity: 'critical',
        title: `Taxa de erro ${p.provider}: ${p.failed}/${p.total} envios falharam nos últimos ${PROVIDER_WINDOW_MINUTES} min`,
        detail:
          `Limiar: ${Math.round(cfg.providerErrorRate * 100)}% com amostra mínima de ${cfg.providerMinSample}.` +
          (p.sampleError ? ` Último erro: ${p.sampleError}` : ''),
      });
    }
  }

  if (s.webhookErrorsLastHour >= cfg.webhookErrorThreshold) {
    issues.push({
      key: 'webhook_errors',
      severity: 'warning',
      title: `${s.webhookErrorsLastHour} webhook(s) com erro na última hora`,
      detail: `Limiar: ${cfg.webhookErrorThreshold}. Ver marketing.webhook_log (status='error') — eventos de entrega/opt-out podem estar se perdendo.`,
    });
  }

  return issues;
}

type Rows<T> = { rows?: T[] };
function asRows<T>(res: unknown): T[] {
  return (res as Rows<T>).rows ?? (res as T[]) ?? [];
}

// Heartbeat de cron — upsert best-effort. Nunca lança (a tabela pode ainda não
// existir se o deploy saiu antes da migration; o motor não pode parar por isso).
export async function beatHeartbeat(key: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    await db
      .insert(opsHeartbeats)
      .values({ key, lastRunAt: new Date(), lastMeta: meta })
      .onConflictDoUpdate({
        target: opsHeartbeats.key,
        set: { lastRunAt: new Date(), lastMeta: meta },
      });
  } catch (err) {
    console.error(`[heartbeat] falha ao registrar ${key}:`, err);
  }
}

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
  const queueRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'dead'
        AND completed_at >= now() - make_interval(mins => ${DEAD_WINDOW_MINUTES}))::int AS dead_last_hour,
      COUNT(*) FILTER (WHERE status = 'claimed'
        AND claimed_at < now() - make_interval(mins => ${STUCK_CLAIMED_MINUTES}))::int AS stuck_claimed,
      COUNT(*) FILTER (WHERE status = 'pending' AND run_at <= now())::int AS pending_due,
      EXTRACT(EPOCH FROM (now() - MIN(run_at) FILTER (WHERE status = 'pending' AND run_at <= now())))::int AS oldest_pending_secs,
      (SELECT last_error FROM marketing.queue_jobs
        WHERE status = 'dead' ORDER BY completed_at DESC NULLS LAST LIMIT 1) AS dead_sample_error
    FROM marketing.queue_jobs
  `);
  const q = asRows<{
    dead_last_hour: number;
    stuck_claimed: number;
    pending_due: number;
    oldest_pending_secs: number | null;
    dead_sample_error: string | null;
  }>(queueRes)[0];

  // Heartbeat do drain — tabela pode não existir ainda (deploy antes da migration).
  let drainAgeMinutes: number | null = null;
  try {
    const hbRes = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (now() - last_run_at))::int AS age_secs
      FROM marketing.ops_heartbeats WHERE key = ${DRAIN_HEARTBEAT_KEY}
    `);
    const hb = asRows<{ age_secs: number }>(hbRes)[0];
    if (hb) drainAgeMinutes = Math.floor(Number(hb.age_secs) / 60);
  } catch {
    drainAgeMinutes = null;
  }

  // Erro por provider — falhas esperadas (allowlist de teste, supressão) não
  // contam: não são erro do provider e inflariam a taxa em dev/homolog.
  const provRes = await db.execute(sql`
    SELECT
      COALESCE(s.provider,
        CASE WHEN s.to_phone IS NOT NULL THEN '__whatsapp__' ELSE '__email__' END) AS provider,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s.status IN ('failed', 'bounced')
        AND (s.error_message IS NULL OR (
          s.error_message NOT LIKE 'blocked_test_mode%'
          AND s.error_message <> 'suppressed before send')))::int AS failed,
      (array_agg(s.error_message ORDER BY s.id DESC)
        FILTER (WHERE s.status IN ('failed', 'bounced') AND s.error_message IS NOT NULL))[1] AS sample_error
    FROM marketing.sends s
    WHERE COALESCE(s.sent_at, s.queued_at) >= now() - make_interval(mins => ${PROVIDER_WINDOW_MINUTES})
    GROUP BY 1
  `);
  const providerStats = asRows<{
    provider: string;
    total: number;
    failed: number;
    sample_error: string | null;
  }>(provRes).map((r) => ({
    // Sends que falharam antes do provider ser gravado caem no canal — rotula
    // com o provider default do canal pra mensagem do alerta fazer sentido.
    provider:
      r.provider === '__whatsapp__'
        ? (process.env.MARKETING_WHATSAPP_PROVIDER ?? 'twilio')
        : r.provider === '__email__'
          ? (process.env.MARKETING_EMAIL_PROVIDER ?? 'brevo')
          : r.provider,
    total: Number(r.total),
    failed: Number(r.failed),
    sampleError: r.sample_error ? r.sample_error.slice(0, 300) : null,
  }));

  const whRes = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM marketing.webhook_log
    WHERE status = 'error' AND received_at >= now() - make_interval(mins => ${WEBHOOK_WINDOW_MINUTES})
  `);
  const webhookErrors = Number(asRows<{ n: number }>(whRes)[0]?.n ?? 0);

  return {
    deadJobsLastHour: Number(q?.dead_last_hour ?? 0),
    deadSampleError: q?.dead_sample_error ? String(q.dead_sample_error).slice(0, 300) : null,
    stuckClaimedJobs: Number(q?.stuck_claimed ?? 0),
    pendingDueJobs: Number(q?.pending_due ?? 0),
    oldestPendingAgeMinutes:
      q?.oldest_pending_secs != null ? Math.floor(Number(q.oldest_pending_secs) / 60) : null,
    drainLastRunAgeMinutes: drainAgeMinutes,
    providerStats,
    webhookErrorsLastHour: webhookErrors,
  };
}

// Filtra issues pelo cooldown (ops_alert_state) e marca as notificadas.
// Se a tabela não existir ainda, notifica sem cooldown (melhor avisar 2x que 0x).
async function filterByCooldown(issues: HealthIssue[], cooldownMinutes: number): Promise<HealthIssue[]> {
  try {
    const res = await db.execute(sql`
      SELECT key, EXTRACT(EPOCH FROM (now() - last_notified_at))::int AS age_secs
      FROM marketing.ops_alert_state
    `);
    const ages = new Map(asRows<{ key: string; age_secs: number }>(res).map((r) => [r.key, Number(r.age_secs)]));
    return issues.filter((i) => {
      const age = ages.get(i.key);
      return age === undefined || age >= cooldownMinutes * 60;
    });
  } catch {
    return issues;
  }
}

async function markNotified(issues: HealthIssue[]): Promise<void> {
  for (const i of issues) {
    try {
      await db
        .insert(opsAlertState)
        .values({ key: i.key, lastNotifiedAt: new Date(), lastMessage: i.title })
        .onConflictDoUpdate({
          target: opsAlertState.key,
          set: { lastNotifiedAt: new Date(), lastMessage: i.title },
        });
    } catch {
      // best-effort — sem estado, o cooldown apenas não vale nesta rodada
    }
  }
}

function formatDigest(issues: HealthIssue[]): string {
  const lines = issues.map(
    (i) => `• [${i.severity === 'critical' ? 'CRÍTICO' : 'ALERTA'}] ${i.title}\n  ${i.detail}`,
  );
  return `🚨 i10 CRM — motor de envios com ${issues.length} problema(s):\n\n${lines.join('\n\n')}`;
}

async function notifyTeam(issues: HealthIssue[], cfg: AlertConfig): Promise<boolean> {
  const digest = formatDigest(issues);
  let delivered = false;

  // Sentry — cada issue vira um evento agrupável por key.
  for (const i of issues) {
    captureMessage(i.title, {
      area: `alerts:${i.key}`,
      level: i.severity === 'critical' ? 'error' : 'warning',
      extra: { detail: i.detail },
    });
  }

  if (cfg.emails.length > 0) {
    try {
      const provider = getEmailProvider();
      const html = `<pre style="font-family:monospace;white-space:pre-wrap">${digest
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`;
      for (const email of cfg.emails) {
        const result = await provider.send({
          fromEmail: process.env.MARKETING_FROM_EMAIL ?? 'contato@institutoi10.org.br',
          fromName: process.env.MARKETING_FROM_NAME ?? 'Instituto i10',
          to: { email },
          subject: `[i10 CRM] Alerta motor de envios — ${issues.length} problema(s)`,
          html,
          text: digest,
        });
        if (result.ok) delivered = true;
        else captureError(new Error(result.error), { area: 'alerts:notify-email', extra: { email } });
      }
    } catch (err) {
      captureError(err, { area: 'alerts:notify-email' });
    }
  }

  // WhatsApp interno — freeform: entrega garantida só dentro da janela de 24h
  // do número destino. Time deve mandar 1 mensagem pro número do CRM de vez em
  // quando (ou configurar template aprovado) pra manter a janela aberta.
  if (cfg.whatsappNumbers.length > 0) {
    try {
      const provider = getWhatsAppProvider();
      for (const number of cfg.whatsappNumbers) {
        const result = await provider.send({
          fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
          toNumber: number,
          body: digest.slice(0, 1500),
        });
        if (result.ok) delivered = true;
        else captureError(new Error(result.error), { area: 'alerts:notify-whatsapp', extra: { number } });
      }
    } catch (err) {
      captureError(err, { area: 'alerts:notify-whatsapp' });
    }
  }

  return delivered;
}

export type HealthCheckResult = {
  healthy: boolean;
  snapshot: HealthSnapshot;
  issues: HealthIssue[];
  /** issues que passaram pelo cooldown e geraram notificação nesta rodada */
  notifiedKeys: string[];
};

// Ponto de entrada — usado pelo cron recover e pelo endpoint /health.
// Nunca lança: qualquer falha interna vira captureError + resultado vazio.
export async function runQueueHealthCheck(
  opts: { notify?: boolean } = {},
): Promise<HealthCheckResult> {
  const cfg = resolveAlertConfig();
  try {
    const snapshot = await collectHealthSnapshot();
    const issues = evaluateHealth(snapshot, cfg);
    let notifiedKeys: string[] = [];

    if (opts.notify && issues.length > 0) {
      const due = await filterByCooldown(issues, cfg.cooldownMinutes);
      if (due.length > 0) {
        await notifyTeam(due, cfg);
        await markNotified(due);
        notifiedKeys = due.map((i) => i.key);
      }
    }

    return { healthy: issues.length === 0, snapshot, issues, notifiedKeys };
  } catch (err) {
    captureError(err, { area: 'alerts:health-check' });
    return {
      healthy: false,
      snapshot: {
        deadJobsLastHour: 0,
        deadSampleError: null,
        stuckClaimedJobs: 0,
        pendingDueJobs: 0,
        oldestPendingAgeMinutes: null,
        drainLastRunAgeMinutes: null,
        providerStats: [],
        webhookErrorsLastHour: 0,
      },
      issues: [
        {
          key: 'health_check_failed',
          severity: 'warning',
          title: 'Health check do motor de envios falhou',
          detail: err instanceof Error ? err.message : String(err),
        },
      ],
      notifiedKeys: [],
    };
  }
}
