import type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult } from './types';

// ─── Twilio WhatsApp provider ─────────────────────────────────────────────
// Suporta 2 modos:
//   1. Freeform — message body em texto (só funciona dentro da janela de 24h
//      após resposta do destinatário). Pra primeira mensagem, NÃO funciona.
//   2. Approved template — contentSid + contentVariables. Necessário pra
//      iniciar conversa com prefeitos que nunca responderam.
//
// Sandbox (dev): TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886"
//   Recipientes precisam enviar "join <keyword>" pro sandbox antes
//   (Twilio Console → Messaging → Try it out → WhatsApp Sandbox)
//
// Production: TWILIO_WHATSAPP_FROM = "whatsapp:+5511XXXXXXXXX" (número aprovado)
//
// Tag do Twilio (passado em statusCallback) volta no webhook pra correlação.

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'twilio';

  constructor(
    private config: {
      accountSid: string;
      authToken: string;
      // Pode ser sandbox (whatsapp:+14155238886) ou produção
      from: string;
      // URL pública pra StatusCallback (delivered/read/failed events)
      statusCallbackUrl?: string;
    },
  ) {
    if (!config.accountSid || !config.authToken) {
      throw new Error('Twilio accountSid + authToken required');
    }
    if (!config.from || !config.from.startsWith('whatsapp:')) {
      throw new Error("Twilio 'from' must be in format 'whatsapp:+E164'");
    }
  }

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    // Lazy import — só carrega twilio SDK quando provider for usado
    let Twilio: typeof import('twilio').Twilio;
    try {
      const mod = await import('twilio');
      // O SDK exporta default function (factory) E classe Twilio
      Twilio = mod.Twilio;
    } catch {
      return {
        ok: false,
        error: 'twilio sdk not installed — run: npm install twilio',
        retryable: false,
        provider: this.name,
      };
    }

    const client = new Twilio(this.config.accountSid, this.config.authToken);

    // Normalizar 'to' — se vier "+5511..." ou "5511...", prefixar "whatsapp:"
    const toNumber = input.toNumber.startsWith('whatsapp:')
      ? input.toNumber
      : `whatsapp:${input.toNumber.startsWith('+') ? input.toNumber : '+' + input.toNumber.replace(/\D/g, '')}`;

    const messageOpts: Record<string, unknown> = {
      from: this.config.from,
      to: toNumber,
    };

    if (input.templateName && input.templateVariables) {
      // Modo template aprovado
      messageOpts.contentSid = input.templateName; // Twilio usa contentSid pra template aprovado
      messageOpts.contentVariables = JSON.stringify(input.templateVariables);
    } else if (input.body) {
      // Modo freeform
      messageOpts.body = input.body;
    } else {
      return {
        ok: false,
        error: 'either body OR (templateName + templateVariables) required',
        retryable: false,
        provider: this.name,
      };
    }

    if (this.config.statusCallbackUrl) {
      messageOpts.statusCallback = this.config.statusCallbackUrl;
    }

    try {
      const message = await client.messages.create(
        messageOpts as unknown as Parameters<typeof client.messages.create>[0],
      );
      return {
        ok: true,
        providerId: message.sid,
        provider: this.name,
      };
    } catch (err) {
      const e = err as { code?: number | string; message?: string; status?: number };
      const message = e.message ?? String(err);
      // Twilio errors: 21610=unsubscribed, 63016=template not approved, 63003=channel not found
      // 21408=permission denied (sandbox: not opted in)
      const codeStr = String(e.code ?? '');
      const nonRetryableCodes = ['21610', '21408', '63016', '63003', '21211'];
      const retryable =
        !nonRetryableCodes.includes(codeStr) &&
        !/permission denied|not opted in|invalid/i.test(message);
      return {
        ok: false,
        error: `twilio${e.code ? `[${e.code}]` : ''}: ${message.slice(0, 500)}`,
        retryable,
        provider: this.name,
      };
    }
  }
}
