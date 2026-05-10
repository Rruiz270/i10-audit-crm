import type { EmailProvider, WhatsAppProvider } from './types';
import { BrevoEmailProvider } from './brevo';
import { SESEmailProvider } from './ses';

// Factory — escolhe o provider baseado em env. Cache em memória pra não
// reinstanciar a cada send (fetch/AWS SDK podem ser pesados de inicializar).

let emailCache: EmailProvider | null = null;

export function getEmailProvider(override?: string): EmailProvider {
  const name = override ?? process.env.MARKETING_EMAIL_PROVIDER ?? 'brevo';

  // Cache só vale quando não há override (cada override é instância nova)
  if (!override && emailCache && emailCache.name === name) return emailCache;

  let provider: EmailProvider;
  switch (name) {
    case 'brevo':
      provider = new BrevoEmailProvider(process.env.BREVO_API_KEY ?? '');
      break;
    case 'ses':
      provider = new SESEmailProvider({
        region: process.env.AWS_SES_REGION ?? 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        configurationSet: process.env.AWS_SES_CONFIG_SET,
      });
      break;
    default:
      throw new Error(`Unknown email provider: ${name}`);
  }

  if (!override) emailCache = provider;
  return provider;
}

let whatsappCache: WhatsAppProvider | null = null;

export function getWhatsAppProvider(override?: string): WhatsAppProvider {
  const name = override ?? process.env.MARKETING_WHATSAPP_PROVIDER ?? 'twilio';

  if (!override && whatsappCache && whatsappCache.name === name) return whatsappCache;

  // Twilio sai na fase 3 — por enquanto stub que falha explicitamente
  // pra detectarmos cedo se algo tentar enviar WA antes da hora.
  const provider: WhatsAppProvider = {
    name,
    async send() {
      return {
        ok: false,
        error: 'whatsapp provider not configured — install in fase 3',
        retryable: false,
        provider: name,
      };
    },
  };

  if (!override) whatsappCache = provider;
  return provider;
}

export type { EmailProvider, WhatsAppProvider, EmailSendInput, EmailSendResult } from './types';
