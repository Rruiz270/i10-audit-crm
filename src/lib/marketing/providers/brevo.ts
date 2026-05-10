import type { EmailProvider, EmailSendInput, EmailSendResult } from './types';

// Brevo (ex-Sendinblue) — provider escolhido p/ a 1ª campanha FUNDEB porque
// não exige warm-up. API REST direta, sem SDK pesado. Endpoint:
//   https://api.brevo.com/v3/smtp/email
// Auth: header `api-key: <BREVO_API_KEY>`

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';

  constructor(private apiKey: string) {
    if (!apiKey) throw new Error('BREVO_API_KEY is required');
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const body = {
      sender: { email: input.fromEmail, name: input.fromName },
      to: [{ email: input.to.email, name: input.to.name }],
      replyTo: input.replyTo ? { email: input.replyTo } : undefined,
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
      headers: input.headers,
      // Tags ajudam a filtrar no dashboard Brevo + voltam no webhook
      tags: input.tag ? [input.tag] : undefined,
    };

    let response: Response;
    try {
      response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Erro de rede — sempre retryable
      return {
        ok: false,
        error: `network: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        provider: this.name,
      };
    }

    if (response.ok) {
      const data = (await response.json()) as { messageId?: string };
      return {
        ok: true,
        providerId: data.messageId ?? `brevo-${Date.now()}`,
        provider: this.name,
      };
    }

    // 4xx = bad request (não retentar). 5xx + 429 = retentar.
    const errorText = await response.text();
    const retryable = response.status >= 500 || response.status === 429;
    return {
      ok: false,
      error: `brevo http ${response.status}: ${errorText.slice(0, 500)}`,
      retryable,
      provider: this.name,
    };
  }

  getRateLimits() {
    // Brevo conta plano-dependente. Plan padrão: 300/dia free, 20k/dia paid.
    // Não há rate per-second documentado mas eles estrangulam ~10/s.
    return { perSecond: 10 };
  }
}
