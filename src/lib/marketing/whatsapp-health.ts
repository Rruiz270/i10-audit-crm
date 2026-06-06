import 'server-only';

// ─── Saúde do canal WhatsApp ───────────────────────────────────────────────
// Lê a config de env e consulta o status de aprovação de templates direto na
// Content API do Twilio. Usado pelo painel "Canal WhatsApp" no dashboard do
// projeto pra controlar disparos sem sair do CRM.

export type WhatsAppConfig = {
  configured: boolean;
  provider: string;
  fromNumber: string | null;
  /** true se um número de produção (não o sandbox compartilhado do Twilio) */
  isProduction: boolean;
  /** Limite padrão de conversas iniciadas/dia até a verificação do negócio sair */
  dailyLimitNote: string;
};

const SANDBOX_FROM = 'whatsapp:+14155238886';

export function getWhatsAppConfig(): WhatsAppConfig {
  const from = process.env.TWILIO_WHATSAPP_FROM ?? null;
  const hasCreds = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  return {
    configured: hasCreds && Boolean(from),
    provider: process.env.MARKETING_WHATSAPP_PROVIDER ?? 'twilio',
    fromNumber: from,
    isProduction: Boolean(from) && from !== SANDBOX_FROM,
    dailyLimitNote: '250 conversas iniciadas/dia até a verificação do negócio na Meta',
  };
}

export type TemplateApproval = {
  contentSid: string;
  status: 'approved' | 'pending' | 'received' | 'rejected' | 'unknown';
  category: string | null;
  rejectionReason: string | null;
};

/**
 * Consulta o status de aprovação WhatsApp de um Content SID (HX...) no Twilio.
 * Best-effort com timeout curto — nunca lança (painel não pode quebrar a página).
 */
export async function getTemplateApproval(contentSid: string): Promise<TemplateApproval> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base: TemplateApproval = {
    contentSid,
    status: 'unknown',
    category: null,
    rejectionReason: null,
  };
  if (!sid || !token || !contentSid.startsWith('HX')) return base;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return base;
    const data = (await res.json()) as {
      whatsapp?: { status?: string; category?: string; rejection_reason?: string };
    };
    const w = data.whatsapp ?? {};
    const status = (w.status ?? 'unknown') as TemplateApproval['status'];
    return {
      contentSid,
      status,
      category: w.category ?? null,
      rejectionReason: w.rejection_reason ?? null,
    };
  } catch {
    return base;
  } finally {
    clearTimeout(timer);
  }
}
