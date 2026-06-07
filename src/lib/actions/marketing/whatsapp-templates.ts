'use server';

import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { templates } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';
import { getTemplateApproval } from '@/lib/marketing/whatsapp-health';

// ─── Template Builder (WhatsApp via Twilio Content API) ────────────────────
// Cria um Content (twilio/text ou twilio/quick-reply) e submete a aprovação à
// Meta, gravando o resultado em marketing.templates (channel='whatsapp').
// Tudo gated admin/gestor; erros do Twilio são surfados como {ok:false,error}.

const CONTENT_API = 'https://content.twilio.com/v1';

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
type Category = (typeof CATEGORIES)[number];

type QuickReplyButton = { id: string; title: string };

function authHeader(): string | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

// Placeholders {{1}}..{{n}} presentes no corpo, ordenados e únicos.
function extractPlaceholders(body: string): number[] {
  const found = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

// Tenta extrair a mensagem de erro mais legível de uma resposta do Twilio.
async function twilioError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; more_info?: string };
    if (data.message) return data.message;
  } catch {
    /* corpo não-JSON */
  }
  return `Twilio respondeu ${res.status} ${res.statusText}`;
}

/**
 * Cria um template WhatsApp: monta o payload Content, POSTa em /Content,
 * submete a aprovação Meta em /Content/{sid}/ApprovalRequests/whatsapp e grava
 * em marketing.templates. Retorna {ok,sid} ou {ok:false,error}.
 */
export async function createWhatsAppTemplate(
  formData: FormData,
): Promise<ActionResult<{ sid: string }>> {
  const user = await requireUser();
  try {
    requireRole(user, ['admin', 'gestor']);
  } catch {
    return { ok: false, error: 'Apenas admin/gestor podem criar templates.' };
  }

  const auth = authHeader();
  if (!auth) return { ok: false, error: 'Credenciais Twilio ausentes (TWILIO_ACCOUNT_SID/AUTH_TOKEN).' };

  // ── Validação dos inputs ──
  const name = String(formData.get('name') ?? '').trim().toLowerCase();
  const language = String(formData.get('language') ?? 'pt_BR').trim() || 'pt_BR';
  const category = String(formData.get('category') ?? '') as Category;
  const body = String(formData.get('body') ?? '').trim();

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return { ok: false, error: 'Nome inválido: use apenas a-z, 0-9 e _ (ex: i10_primeiro_contato).' };
  }
  if (!CATEGORIES.includes(category)) {
    return { ok: false, error: 'Categoria inválida (MARKETING | UTILITY | AUTHENTICATION).' };
  }
  if (!body) return { ok: false, error: 'O corpo da mensagem é obrigatório.' };

  // Placeholders + amostras (a Meta exige sample por variável).
  const placeholders = extractPlaceholders(body);
  const variables: Record<string, string> = {};
  for (const n of placeholders) {
    const sample = String(formData.get(`sample_${n}`) ?? '').trim();
    if (!sample) {
      return { ok: false, error: `Informe um exemplo para a variável {{${n}}} (exigido pela Meta).` };
    }
    variables[String(n)] = sample;
  }

  // Botões quick-reply (até 3). title obrigatório quando o slot é usado.
  const buttons: QuickReplyButton[] = [];
  for (let i = 1; i <= 3; i++) {
    const title = String(formData.get(`button_${i}`) ?? '').trim();
    if (title) buttons.push({ id: `btn_${i}`, title });
  }
  if (buttons.length > 3) {
    return { ok: false, error: 'Máximo de 3 botões quick-reply.' };
  }

  // ── Monta o payload Content ──
  const types: Record<string, unknown> = buttons.length
    ? { 'twilio/quick-reply': { body, actions: buttons } }
    : { 'twilio/text': { body } };

  const contentPayload = {
    friendly_name: name,
    language,
    variables,
    types,
  };

  // ── 1. POST /Content → ContentSid ──
  let sid: string;
  try {
    const res = await fetch(`${CONTENT_API}/Content`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(contentPayload),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: await twilioError(res) };
    const data = (await res.json()) as { sid?: string };
    if (!data.sid) return { ok: false, error: 'Twilio não retornou um ContentSid.' };
    sid = data.sid;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao criar o Content.' };
  }

  // ── 2. POST /Content/{sid}/ApprovalRequests/whatsapp → submete à Meta ──
  // O `name` aqui precisa casar com as regras da Meta (snake_case, já validado).
  try {
    const res = await fetch(`${CONTENT_API}/Content/${sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category }),
      cache: 'no-store',
    });
    if (!res.ok) {
      // O Content já existe no Twilio; reportamos o erro de aprovação mas o SID
      // foi criado. Gravamos mesmo assim para o operador poder re-tentar/apagar.
      const err = await twilioError(res);
      await persistTemplate({ name, sid, language, category, body, buttons, variables, status: 'draft' });
      return { ok: false, error: `Content criado (${sid}) mas a submissão à Meta falhou: ${err}` };
    }
  } catch (e) {
    await persistTemplate({ name, sid, language, category, body, buttons, variables, status: 'draft' });
    return {
      ok: false,
      error: `Content criado (${sid}) mas a submissão à Meta falhou: ${e instanceof Error ? e.message : 'erro de rede'}`,
    };
  }

  // ── 3. Insert em marketing.templates ──
  await persistTemplate({ name, sid, language, category, body, buttons, variables, status: 'active' });

  revalidatePath('/marketing/templates');
  return { ok: true, sid };
}

async function persistTemplate(args: {
  name: string;
  sid: string;
  language: string;
  category: Category;
  body: string;
  buttons: QuickReplyButton[];
  variables: Record<string, string>;
  status: 'active' | 'draft';
}) {
  await db.insert(templates).values({
    projectId: null,
    channel: 'whatsapp',
    name: args.name,
    text: args.body,
    waTemplateName: args.sid,
    waTemplateLanguage: args.language,
    category: args.category,
    waButtons: args.buttons,
    // `variables` (text[]) guarda as posições declaradas no corpo.
    variables: Object.keys(args.variables).map(String),
    status: args.status,
  });
}

export type WhatsappTemplateRow = {
  id: number;
  name: string;
  contentSid: string;
  category: string | null;
  language: string | null;
  body: string | null;
  buttons: QuickReplyButton[];
  approvalStatus: string;
  rejectionReason: string | null;
};

/**
 * Lista os templates WhatsApp (todos os projetos + standalone) com o status de
 * aprovação ao vivo (cache TTL). Gated admin/gestor.
 */
export async function listWhatsappTemplatesWithStatus(): Promise<WhatsappTemplateRow[]> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      waTemplateName: templates.waTemplateName,
      category: templates.category,
      language: templates.waTemplateLanguage,
      body: templates.text,
      buttons: templates.waButtons,
    })
    .from(templates)
    .where(eq(templates.channel, 'whatsapp'))
    .orderBy(desc(templates.createdAt));

  const withSid = rows.filter((r) => !!r.waTemplateName);

  return Promise.all(
    withSid.map(async (r) => {
      const sid = r.waTemplateName as string;
      const approval = sid.startsWith('HX')
        ? await getTemplateApproval(sid)
        : { status: 'unknown' as const, rejectionReason: null };
      return {
        id: r.id,
        name: r.name,
        contentSid: sid,
        category: r.category,
        language: r.language,
        body: r.body,
        buttons: Array.isArray(r.buttons) ? (r.buttons as QuickReplyButton[]) : [],
        approvalStatus: approval.status,
        rejectionReason: approval.rejectionReason,
      };
    }),
  );
}

/**
 * Re-checa a aprovação de um Content SID, ignorando o cache TTL. Usado pelo
 * botão "Atualizar status". Gated admin/gestor.
 */
export async function refreshTemplateStatus(
  contentSid: string,
): Promise<ActionResult<{ approvalStatus: string; rejectionReason: string | null }>> {
  const user = await requireUser();
  try {
    requireRole(user, ['admin', 'gestor']);
  } catch {
    return { ok: false, error: 'Apenas admin/gestor.' };
  }
  if (!contentSid.startsWith('HX')) {
    return { ok: false, error: 'ContentSid inválido.' };
  }
  const approval = await getTemplateApproval(contentSid, { bustCache: true });

  // Sincroniza o status local (active quando aprovado).
  if (approval.status === 'approved') {
    await db
      .update(templates)
      .set({ status: 'active' })
      .where(and(eq(templates.channel, 'whatsapp'), eq(templates.waTemplateName, contentSid)));
  }

  revalidatePath('/marketing/templates');
  return { ok: true, approvalStatus: approval.status, rejectionReason: approval.rejectionReason };
}
