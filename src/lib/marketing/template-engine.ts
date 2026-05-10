import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ─── Template Engine — provider-agnostic rendering pipeline ───────────────
// Responsabilidades:
//   1. Substituir {{var}} pelos valores do mergeVars (HTML-escape por padrão)
//   2. Reescrever todos <a href="..."> apontando pra /api/marketing/t/c/...
//      (exceto mailto:, tel:, âncoras puras, e o link de unsubscribe)
//   3. Injetar pixel 1x1 de open tracking antes do </body>
//   4. Resolver {{unsubscribe_url}} para URL assinada com HMAC
//   5. Gerar versão texto (strip HTML simples) pra deliverability
//   6. Retornar header List-Unsubscribe pronto pra incluir no envio
//
// Tudo síncrono e puro — sem DB, sem rede. Recebe o que precisa, devolve
// o renderizado. Quem persiste sends/events é a camada de actions.

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// ─── Tokens ────────────────────────────────────────────────────────────────

export function generateTrackingToken(): string {
  return b64urlEncode(randomBytes(32));
}

type UnsubPayload = { e: string; x: number; n: string };

export function generateUnsubscribeToken(
  email: string,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 365,
): string {
  const payload: UnsubPayload = {
    e: email.toLowerCase().trim(),
    x: Math.floor(Date.now() / 1000) + ttlSeconds,
    n: b64urlEncode(randomBytes(8)),
  };
  const data = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = b64urlEncode(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): { ok: true; email: string } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [data, sig] = parts;
  const expected = b64urlEncode(createHmac('sha256', secret).update(data).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'bad_signature' };
  let payload: UnsubPayload;
  try {
    payload = JSON.parse(b64urlDecode(data).toString('utf8')) as UnsubPayload;
  } catch {
    return { ok: false, reason: 'malformed_payload' };
  }
  if (typeof payload.e !== 'string') return { ok: false, reason: 'no_email' };
  if (payload.x && payload.x < Math.floor(Date.now() / 1000))
    return { ok: false, reason: 'expired' };
  return { ok: true, email: payload.e };
}

// ─── Mailmerge — {{var}} replacement ──────────────────────────────────────

const MERGE_VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderMergeVars(
  template: string,
  vars: Record<string, unknown>,
  options: { escape?: boolean } = {},
): string {
  const escape = options.escape !== false;
  return template.replace(MERGE_VAR_RE, (_, key) => {
    const value = vars[key];
    if (value === undefined) return '';
    return escape ? escapeHtml(value) : String(value);
  });
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(MERGE_VAR_RE)) {
    found.add(match[1]);
  }
  return Array.from(found).sort();
}

// ─── Link rewriting + open pixel ──────────────────────────────────────────

export type RenderOptions = {
  trackingBaseUrl: string;
  trackingToken: string;
  unsubscribeSecret: string;
  recipientEmail: string;
  appendDefaultFooter?: boolean;
  senderIdentity?: {
    name: string;
    email: string;
    address?: string;
  };
};

const SKIP_LINK_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^sms:/i,
  /^#/,
  /^\{\{unsubscribe_url\}\}$/,
  /^javascript:/i,
];

function shouldRewriteLink(href: string): boolean {
  return !SKIP_LINK_PATTERNS.some((re) => re.test(href.trim()));
}

function rewriteLinks(html: string, opts: RenderOptions): { html: string; linkCount: number } {
  let linkIndex = 0;
  const re = /\bhref\s*=\s*(["'])([^"']*)\1/gi;
  const rewritten = html.replace(re, (full, quote, href) => {
    if (!shouldRewriteLink(href)) return full;
    const linkId = linkIndex++;
    const targetUrl = renderMergeVars(href, {}, { escape: false });
    const trackingUrl =
      `${opts.trackingBaseUrl.replace(/\/$/, '')}/api/marketing/t/c/${opts.trackingToken}` +
      `?l=${linkId}&u=${encodeURIComponent(targetUrl)}`;
    return `href=${quote}${escapeAttribute(trackingUrl)}${quote}`;
  });
  return { html: rewritten, linkCount: linkIndex };
}

function buildPixel(opts: RenderOptions): string {
  const url = `${opts.trackingBaseUrl.replace(/\/$/, '')}/api/marketing/t/o/${opts.trackingToken}`;
  return `<img src="${escapeAttribute(url)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`;
}

function buildUnsubscribeUrl(opts: RenderOptions): string {
  const token = generateUnsubscribeToken(opts.recipientEmail, opts.unsubscribeSecret);
  return `${opts.trackingBaseUrl.replace(/\/$/, '')}/u/unsubscribe?t=${token}`;
}

function buildOneClickUnsubscribeUrl(opts: RenderOptions): string {
  // URL distinta usada APENAS no header List-Unsubscribe (RFC 8058 one-click).
  // Mailbox providers POST aqui automaticamente — sem UI.
  const token = generateUnsubscribeToken(opts.recipientEmail, opts.unsubscribeSecret);
  return `${opts.trackingBaseUrl.replace(/\/$/, '')}/api/marketing/unsubscribe?t=${token}`;
}

function buildDefaultFooter(opts: RenderOptions, unsubscribeUrl: string): string {
  const sender = opts.senderIdentity ?? {
    name: 'Instituto i10',
    email: 'contato@institutoi10.org.br',
  };
  return `
<div style="margin-top:32px;padding:20px 24px;background:#f1f5f9;color:#64748b;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center;border-top:1px solid #cbd5e1">
  <p style="margin:0 0 8px"><b>${escapeHtml(sender.name)}</b></p>
  ${sender.address ? `<p style="margin:0 0 8px">${escapeHtml(sender.address)}</p>` : ''}
  <p style="margin:0 0 8px">${escapeHtml(sender.email)}</p>
  <p style="margin:0">Você está recebendo este email com base em interesse legítimo (LGPD Art. 7º IX).
  <a href="${escapeAttribute(unsubscribeUrl)}" style="color:#0A2463">Descadastrar com 1 clique</a>.</p>
</div>`;
}

// ─── Plain text version ───────────────────────────────────────────────────

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Render principal ─────────────────────────────────────────────────────

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  listUnsubscribeHeader: string;
  listUnsubscribePostHeader: string;
  variablesReferenced: string[];
  variablesMissing: string[];
  linkCount: number;
};

export function renderEmail(
  template: { subject: string; html: string },
  mergeVars: Record<string, unknown>,
  opts: RenderOptions,
): RenderedEmail {
  const unsubscribeUrl = buildUnsubscribeUrl(opts);
  const allVars = { ...mergeVars, unsubscribe_url: unsubscribeUrl };

  const subject = renderMergeVars(template.subject, mergeVars, { escape: false });
  let html = renderMergeVars(template.html, allVars);

  const hadUnsubscribePlaceholder = template.html.includes('{{unsubscribe_url}}');
  if (!hadUnsubscribePlaceholder && opts.appendDefaultFooter !== false) {
    const footer = buildDefaultFooter(opts, unsubscribeUrl);
    html = injectBeforeBodyClose(html, footer);
  }

  const rewriteResult = rewriteLinks(html, opts);
  html = rewriteResult.html;

  html = injectBeforeBodyClose(html, buildPixel(opts));

  const variablesReferenced = extractVariables(template.html + ' ' + template.subject);
  const variablesMissing = variablesReferenced.filter(
    (v) => v !== 'unsubscribe_url' && !(v in mergeVars),
  );

  // Header List-Unsubscribe: duas URLs (one-click POST endpoint + mailto fallback).
  // RFC 8058 exige formato `<url>` separado por `, `.
  const oneClickUrl = buildOneClickUnsubscribeUrl(opts);
  return {
    subject,
    html,
    text: htmlToPlainText(html),
    unsubscribeUrl,
    listUnsubscribeHeader: `<${oneClickUrl}>, <mailto:${
      opts.senderIdentity?.email ?? 'unsubscribe@institutoi10.org.br'
    }?subject=unsubscribe>`,
    listUnsubscribePostHeader: 'List-Unsubscribe=One-Click',
    variablesReferenced,
    variablesMissing,
    linkCount: rewriteResult.linkCount,
  };
}

function injectBeforeBodyClose(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  }
  return html + '\n' + snippet;
}

// ─── Render WhatsApp ───────────────────────────────────────────────────────

export type RenderedWhatsApp = {
  body: string;
  twilioContentVariables?: Record<string, string>;
};

export function renderWhatsAppFreeform(
  body: string,
  mergeVars: Record<string, unknown>,
): RenderedWhatsApp {
  return { body: renderMergeVars(body, mergeVars, { escape: false }) };
}

export function renderWhatsAppTemplate(
  variables: string[],
  mergeVars: Record<string, unknown>,
): RenderedWhatsApp {
  const twilioContentVariables: Record<string, string> = {};
  variables.forEach((varName, idx) => {
    const value = mergeVars[varName];
    twilioContentVariables[String(idx + 1)] = value === undefined ? '' : String(value);
  });
  return { body: '', twilioContentVariables };
}
