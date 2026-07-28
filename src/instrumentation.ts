import type { Instrumentation } from 'next';

// ─── Instrumentation (Sentry) ──────────────────────────────────────────────
// Inicializa o Sentry no boot do servidor (Node e Edge). Sem SENTRY_DSN
// configurada, tudo vira no-op — dev/preview continuam funcionando sem conta.
//
// Só instrumentamos o servidor (crons, fila, webhooks, server actions).
// Client-side fica de fora de propósito: o problema que queremos enxergar é
// falha de envio morrendo em console.log, não erro de UI.

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    // Tracing desligado por padrão — alertas aqui são de erro, não de perf.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
  });
}

// Erros não tratados de rotas/rendering (inclui crons e webhooks que estourem
// antes dos nossos try/catch) vão pro Sentry com contexto do request.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
};
