// ─── Observabilidade — funil único de erros do servidor ────────────────────
// Toda falha operacional relevante (cron, fila, webhook, provider) passa por
// aqui: sempre loga no console (visível em `vercel logs`) e, se SENTRY_DSN
// estiver configurada, reporta ao Sentry com tag de área pra agrupamento.
//
// Regras:
//   - NUNCA lança — observabilidade não pode derrubar o motor de envios.
//   - Import do Sentry é lazy: sem DSN o SDK nem é carregado (cold start leve,
//     e testes rodam sem tocar no pacote).

export type CaptureContext = {
  /** Área do sistema, vira tag no Sentry. Ex: 'cron:drain', 'webhook:twilio'. */
  area: string;
  extra?: Record<string, unknown>;
};

function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

export function captureError(err: unknown, ctx: CaptureContext): void {
  console.error(`[${ctx.area}]`, err, ctx.extra ?? '');
  if (!sentryEnabled()) return;
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(err, { tags: { area: ctx.area }, extra: ctx.extra });
    })
    .catch(() => {});
}

export function captureMessage(
  message: string,
  ctx: CaptureContext & { level?: 'info' | 'warning' | 'error' },
): void {
  const level = ctx.level ?? 'warning';
  console[level === 'info' ? 'log' : 'error'](`[${ctx.area}] ${message}`, ctx.extra ?? '');
  if (!sentryEnabled()) return;
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureMessage(message, { level, tags: { area: ctx.area }, extra: ctx.extra });
    })
    .catch(() => {});
}
