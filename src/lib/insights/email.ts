// Insight emails — sai pelo nosso engine (Brevo) ao invés do Gmail SMTP do
// i10-insights original. Mantém mesma interface { to, subject, html, text }
// e grava no insights.email_log pra auditoria histórica.

import { neon } from '@neondatabase/serverless';
import { getEmailProvider } from '@/lib/marketing/providers';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: 'confirmation' | 'digest' | 'unsubscribe-confirm';
  subscriberId?: string; // pra logar em email_log
}

interface SendResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

const FROM_EMAIL = process.env.INSIGHTS_FROM_EMAIL ?? 'institutoi10.org@gmail.com';
const FROM_NAME = 'i10 Insights';

export async function sendInsightEmail(args: SendArgs): Promise<SendResult> {
  const provider = getEmailProvider();
  const result = await provider.send({
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
    to: { email: args.to },
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: {
      'X-Insight-Kind': args.kind,
    },
    tag: `insight:${args.kind}`,
  });

  // Log na insights.email_log (mesma tabela que i10-insights usa)
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO insights.email_log (subscriber_id, email, kind, subject, resend_id)
    VALUES (
      ${args.subscriberId ?? null},
      ${args.to},
      ${args.kind},
      ${args.subject},
      ${result.ok ? result.providerId : null}
    )
  `;

  return result.ok
    ? { ok: true, id: result.providerId }
    : { ok: false, reason: result.error };
}
