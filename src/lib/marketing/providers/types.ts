// ─── Provider abstraction — interface comum p/ Brevo, SES e futuros ──────
// Toda send pipeline fala SÓ com `EmailProvider` / `WhatsAppProvider`.
// Trocar provider = trocar uma linha no factory + env var. Engine não muda.

export type EmailSendInput = {
  fromEmail: string;
  fromName?: string;
  to: { email: string; name?: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  // Headers extras — usados p/ List-Unsubscribe (LGPD) e tracking ID
  headers?: Record<string, string>;
  // ID interno (sends.id) — incluído como tag pra correlacionar webhooks
  tag?: string;
};

export type EmailSendResult =
  | { ok: true; providerId: string; provider: string }
  | { ok: false; error: string; retryable: boolean; provider: string };

export interface EmailProvider {
  readonly name: string; // 'brevo' | 'ses' | etc
  send(input: EmailSendInput): Promise<EmailSendResult>;
  // Limite por conta — usado p/ throttle. null = sem limite documentado.
  getRateLimits(): { perSecond?: number; perDay?: number } | null;
}

// ─── WhatsApp ──────────────────────────────────────────────────────────────

export type WhatsAppSendInput = {
  fromNumber: string; // ex: 'whatsapp:+5511...'
  toNumber: string; // ex: 'whatsapp:+5511...'
  // Modo 1: freeform (só funciona dentro da janela de 24h)
  body?: string;
  // Modo 2: template aprovado pela Meta (necessário fora da janela)
  templateName?: string;
  templateLanguage?: string;
  templateVariables?: Record<string, string>; // { "1": "valor", "2": ... }
  // Modo 3: mídia (ex: voice note). URL PÚBLICA fetchável pelo Twilio
  // (ex: Vercel Blob). Combinável com body (legenda) — ou sozinha.
  mediaUrl?: string;
  // Tag interna pra correlação com webhook
  tag?: string;
};

export type WhatsAppSendResult =
  | { ok: true; providerId: string; provider: string }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      provider: string;
      // Código numérico do provider (ex: '63003' Twilio) — permite ao pipeline
      // reagir por código (supressão, pausa) sem parsear a string de erro
      errorCode?: string;
      // Saturação (tier/rate limit do canal): só reagendar depois desse intervalo
      retryAfterSeconds?: number;
    };

export interface WhatsAppProvider {
  readonly name: string;
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
}
