import type { EmailProvider, EmailSendInput, EmailSendResult } from './types';

// AWS SES — provider de longo prazo. Usa o pacote oficial AWS SDK v3 quando
// disponível. Pra esse stub não importamos o SDK ainda — adicionamos quando
// SES estiver aquecido (depois da 1ª campanha rodar via Brevo).
//
// Quando ativar:
//   npm install @aws-sdk/client-ses @aws-sdk/credential-providers
//   import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export class SESEmailProvider implements EmailProvider {
  readonly name = 'ses';

  constructor(
    private config: {
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      // Configuration set p/ habilitar SNS de bounce/complaint
      configurationSet?: string;
    },
  ) {
    if (!config.region) throw new Error('SES region is required');
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // Lazy import — só carrega o SDK SES quando este provider é instanciado.
    // Isso evita custo de bundle quando o usuário roda só Brevo.
    let SESClient: typeof import('@aws-sdk/client-ses').SESClient;
    let SendEmailCommand: typeof import('@aws-sdk/client-ses').SendEmailCommand;
    try {
      const ses = await import('@aws-sdk/client-ses');
      SESClient = ses.SESClient;
      SendEmailCommand = ses.SendEmailCommand;
    } catch {
      return {
        ok: false,
        error: 'ses sdk not installed — run: npm install @aws-sdk/client-ses',
        retryable: false,
        provider: this.name,
      };
    }

    const client = new SESClient({
      region: this.config.region,
      credentials:
        this.config.accessKeyId && this.config.secretAccessKey
          ? {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey,
            }
          : undefined,
    });

    const fromHeader = input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail;

    const command = new SendEmailCommand({
      Source: fromHeader,
      Destination: { ToAddresses: [input.to.email] },
      Message: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: input.html, Charset: 'UTF-8' },
          Text: { Data: input.text, Charset: 'UTF-8' },
        },
      },
      ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
      ConfigurationSetName: this.config.configurationSet,
      // SES suporta tags — vão pro evento SNS p/ correlação
      Tags: input.tag ? [{ Name: 'send_id', Value: input.tag }] : undefined,
    });

    try {
      const result = await client.send(command);
      return {
        ok: true,
        providerId: result.MessageId ?? `ses-${Date.now()}`,
        provider: this.name,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Throttling SES = $ThrottlingException ou rate exceeded → retryable
      const retryable =
        /throttl/i.test(message) || /rate/i.test(message) || /timeout/i.test(message);
      return {
        ok: false,
        error: `ses: ${message.slice(0, 500)}`,
        retryable,
        provider: this.name,
      };
    }
  }

  getRateLimits() {
    // SES depende do tier — sandbox: 1/s, 200/dia. Production warm-up sobe
    // gradualmente até 14/s, 50k/dia (e além). Vamos retornar conservador
    // até checarmos o tier real via API.
    return { perSecond: 5, perDay: 5000 };
  }
}
