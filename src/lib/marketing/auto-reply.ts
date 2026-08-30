import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  audiences,
  campaigns,
  contacts,
  conversations,
  listMembers,
  messages,
  projects,
  sends,
} from '../schema-marketing';
import { getWhatsAppProvider } from './providers';

// ─── Resposta automática do WhatsApp ───────────────────────────────────────
// Quem toca em "Quero o material" precisa receber o material na hora — não
// quando um atendente abrir o inbox. Roda em linha no webhook de inbound
// (a janela de 24h acabou de abrir, então a mensagem é freeform).
//
// Ligada por projeto, em projects.settings:
//   "autoReply": {
//     "enabled": true,
//     "message": "Perfeito, {{primeiro_nome}}! …{{link_lp}}…",
//     "quietHours": false        // opcional: não responder de madrugada
//   }
//
// Três travas, nesta ordem — qualquer uma cancela o envio:
//   1. só responde a contato que está numa audiência do projeto;
//   2. nunca responde duas vezes na mesma conversa (tag na conversa);
//   3. nunca interrompe atendimento humano em andamento.

const HUMANO_RECENTE_MS = 6 * 60 * 60 * 1000;

type AutoReplyConfig = {
  enabled?: boolean;
  message?: string;
  quietHours?: boolean;
};

export type AutoReplyResult =
  | { sent: true; projectSlug: string; body: string }
  | { sent: false; reason: string };

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

export async function maybeAutoReply(input: {
  conversationId: number;
  contactId: number | null;
  phone: string;
}): Promise<AutoReplyResult> {
  const { conversationId, phone } = input;

  // 1. Quem é essa pessoa na campanha?
  // O mesmo telefone costuma aparecer em vários contatos (cadastros antigos,
  // registros de teste), e o inbound casa só o primeiro. Então olhamos todos
  // os contatos daquele número e escolhemos o que está numa audiência de um
  // projeto com auto-resposta ligada — senão o robô ficaria mudo justamente
  // para quem veio da campanha.
  const digitos = phone.replace(/\D/g, '').slice(-11);
  const candidatos = await db
    .selectDistinct({
      contactId: contacts.id,
      projectId: projects.id,
      slug: projects.slug,
      settings: projects.settings,
    })
    .from(contacts)
    .innerJoin(listMembers, eq(listMembers.contactId, contacts.id))
    .innerJoin(audiences, eq(audiences.id, listMembers.audienceId))
    .innerJoin(projects, eq(projects.id, audiences.projectId))
    .where(
      and(
        eq(projects.status, 'active'),
        eq(contacts.status, 'active'),
        sql`right(regexp_replace(coalesce(${contacts.whatsapp}, ${contacts.phone}, ''), '\\D', '', 'g'), 11) = ${digitos}`,
      ),
    );

  const escolhido = candidatos.find((p) => {
    const cfg = (p.settings as Record<string, unknown> | null)?.autoReply as AutoReplyConfig | undefined;
    return cfg?.enabled && cfg.message;
  });
  if (!escolhido) return { sent: false, reason: 'nenhum projeto do contato tem auto-resposta ligada' };

  const contactId = escolhido.contactId;
  const proj = { id: escolhido.projectId, slug: escolhido.slug, settings: escolhido.settings };

  const settings = (proj.settings ?? {}) as Record<string, unknown>;
  const cfg = settings.autoReply as AutoReplyConfig;

  // Madrugada: uma resposta automática às 3h chama mais atenção do que ajuda.
  if (cfg.quietHours) {
    const horaBr = Number(
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    );
    if (horaBr < 7 || horaBr >= 22) return { sent: false, reason: 'fora do horário' };
  }

  // 2. Já respondemos nesta conversa?
  const tag = `auto-reply:${proj.slug}`;
  const [conv] = await db
    .select({ tags: conversations.tags })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if ((conv?.tags ?? []).includes(tag)) return { sent: false, reason: 'já respondido nesta conversa' };

  // 3. Tem gente atendendo? Então o robô não entra na frente.
  const humano = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, 'outbound'),
        isNotNull(messages.authorUserId),
        gt(messages.createdAt, new Date(Date.now() - HUMANO_RECENTE_MS)),
      ),
    )
    .limit(1);
  if (humano.length) return { sent: false, reason: 'atendimento humano em andamento' };

  // Dados do contato + token do último disparo (mantém o rastreio da LP
  // amarrado à pessoa certa mesmo quando ela chega pelo WhatsApp).
  const [contato] = await db
    .select({
      name: contacts.name,
      municipio: contacts.municipio,
      ibge: contacts.ibge,
      attributes: contacts.attributes,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contato) return { sent: false, reason: 'contato não encontrado' };

  const [ultimoSend] = await db
    .select({ token: sends.trackingToken })
    .from(sends)
    .innerJoin(campaigns, eq(campaigns.id, sends.campaignId))
    .where(and(eq(sends.contactId, contactId), eq(campaigns.projectId, proj.id)))
    .orderBy(desc(sends.id))
    .limit(1);

  const attrs = (contato.attributes ?? {}) as Record<string, unknown>;
  const lpBaseUrl = typeof settings.lpBaseUrl === 'string' ? settings.lpBaseUrl : '';
  const q = ultimoSend?.token
    ? `?t=${encodeURIComponent(ultimoSend.token)}${contato.ibge ? `&ibge=${contato.ibge}` : ''}`
    : contato.ibge
      ? `?ibge=${contato.ibge}`
      : '';

  const vars: Record<string, string> = {
    nome: contato.name ?? '',
    primeiro_nome:
      (typeof attrs.primeiro_nome === 'string' && attrs.primeiro_nome) ||
      String(contato.name ?? '').split(' ')[0] ||
      '',
    municipio: contato.municipio ?? '',
    link_lp: lpBaseUrl ? `${lpBaseUrl}${q}` : '',
    link_aula: lpBaseUrl ? `${lpBaseUrl}/aula${q}` : '',
  };
  const body = render(cfg.message!, vars).trim();
  if (!body) return { sent: false, reason: 'mensagem vazia após renderizar' };

  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? '',
    toNumber: phone,
    body,
    tag: `autoreply:${conversationId}`,
  });
  if (!result.ok) return { sent: false, reason: `provider: ${result.error}` };

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.providerId ?? null,
    direction: 'outbound',
    authorUserId: null, // sem autor = enviado pelo sistema
    body,
    status: 'sent',
  });

  // A tag é a trava contra responder de novo — e aparece no inbox, então o
  // atendente vê que a pessoa já recebeu o material.
  await db
    .update(conversations)
    .set({
      tags: sql`array_append(coalesce(${conversations.tags}, '{}'), ${tag})`,
      lastMessageAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  return { sent: true, projectSlug: proj.slug, body };
}
