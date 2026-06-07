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

// Cache em memória com TTL — evita disparar N fetches ao Twilio a cada render do
// dashboard (status de aprovação muda raramente). Instâncias serverless reusadas
// aproveitam o cache; pior caso é um fetch por instância a cada 5 min.
const APPROVAL_TTL_MS = 5 * 60 * 1000;
const approvalCache = new Map<string, { at: number; value: TemplateApproval }>();

/**
 * Consulta o status de aprovação WhatsApp de um Content SID (HX...) no Twilio.
 * Best-effort, com cache TTL e timeout curto — nunca lança (painel não pode
 * quebrar a página). Não pega `Date.now` em workflow; aqui é server action normal.
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

  const cached = approvalCache.get(contentSid);
  if (cached && Date.now() - cached.at < APPROVAL_TTL_MS) return cached.value;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      // 401/403 = credenciais rejeitadas (rotação/erro) — operador precisa saber.
      if (res.status === 401 || res.status === 403) {
        console.error(`getTemplateApproval: Twilio rejeitou credenciais (${res.status}) p/ ${contentSid}`);
      }
      return base;
    }
    const data = (await res.json()) as {
      whatsapp?: { status?: string; category?: string; rejection_reason?: string };
    };
    const w = data.whatsapp ?? {};
    const status = (w.status ?? 'unknown') as TemplateApproval['status'];
    const value: TemplateApproval = {
      contentSid,
      status,
      category: w.category ?? null,
      rejectionReason: w.rejection_reason ?? null,
    };
    approvalCache.set(contentSid, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error(`getTemplateApproval: erro consultando ${contentSid}:`, err);
    return base;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Corpo (body) de um template Content ───────────────────────────────────
// Busca o texto do template na Content API do Twilio para podermos renderizar
// localmente (substituir {{1}},{{2}},…) e gravar a mensagem real no inbox em
// vez do placeholder "[Template …]". Cache TTL como o de aprovação. Best-effort:
// retorna null se não der pra obter (chamador faz fallback pro placeholder).
const bodyCache = new Map<string, { at: number; value: string | null }>();

export async function getTemplateBody(contentSid: string): Promise<string | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !contentSid.startsWith('HX')) return null;

  const cached = bodyCache.get(contentSid);
  if (cached && Date.now() - cached.at < APPROVAL_TTL_MS) return cached.value;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      types?: Record<string, { body?: string }>;
    };
    const types = data.types ?? {};
    const body =
      types['twilio/quick-reply']?.body ??
      types['twilio/text']?.body ??
      types['twilio/call-to-action']?.body ??
      null;
    bodyCache.set(contentSid, { at: Date.now(), value: body });
    return body;
  } catch (err) {
    console.error(`getTemplateBody: erro consultando ${contentSid}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Renderiza um body de template substituindo {{1}},{{2}},… pelas variáveis
// fornecidas ({ "1": ..., "2": ... }). Placeholders sem valor ficam intactos.
export function renderTemplateBody(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) =>
    variables[n] != null ? variables[n] : m,
  );
}
