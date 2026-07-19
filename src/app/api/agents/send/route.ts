import { getWhatsAppProvider } from '@/lib/marketing/providers';
import { db } from '@/lib/db';
import { messages, conversations } from '@/lib/schema-marketing';
import { isSuppressed } from '@/lib/marketing/suppression';
import { eq } from 'drizzle-orm';

// POST /api/agents/send
// Envio real acionado pela aprovação no painel de Agentes. Reusa o provider
// Twilio do CRM e registra a mensagem no /atende.
//
// TRAVAS (todas precisam passar):
//   AGENT_SEND_ENABLED=1                  liga o envio (sem isso, no-op)
//   AGENT_SEND_SECRET                     header x-agent-secret precisa bater
//   AGENT_SEND_TEST_TO (opcional)         modo teste: TODO envio vai pra este número
//   suppression (marketing.suppressions)  respeitada
export const dynamic = 'force-dynamic';

type Body = {
  conversationId?: number;
  to?: string;
  contentSid?: string;
  variables?: Record<string, string>;
  agent?: string;
};

export async function POST(request: Request) {
  const secret = process.env.AGENT_SEND_SECRET;
  if (!secret) return Response.json({ error: 'send não configurado' }, { status: 503 });
  if (request.headers.get('x-agent-secret') !== secret)
    return Response.json({ error: 'não autorizado' }, { status: 401 });

  if (process.env.AGENT_SEND_ENABLED !== '1')
    return Response.json({ skipped: 'AGENT_SEND_ENABLED != 1', sent: false });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return Response.json({ error: 'json inválido' }, { status: 400 }); }

  const { conversationId, to, contentSid, variables, agent } = body;
  if (!contentSid || (!to && !conversationId))
    return Response.json({ error: 'faltam contentSid e destino' }, { status: 400 });

  // modo teste: sobrescreve o destinatário
  const testTo = process.env.AGENT_SEND_TEST_TO?.trim();
  const recipient = testTo || to || '';
  if (!recipient) return Response.json({ error: 'sem destinatário' }, { status: 400 });

  if (await isSuppressed(recipient, 'whatsapp'))
    return Response.json({ skipped: 'suprimido', sent: false });

  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: recipient,
    templateName: contentSid,
    templateLanguage: 'pt_BR',
    templateVariables: variables ?? {},
    tag: `agent:${agent ?? 'send'}`,
  });

  // registra no /atende (se veio de uma conversa)
  if (conversationId) {
    try {
      await db.insert(messages).values({
        conversationId,
        twilioSid: result.ok ? result.providerId : null,
        direction: 'outbound',
        body: `[template ${contentSid}] enviado pelo agente`,
        isTemplate: true,
        templateSid: contentSid,
        status: result.ok ? 'sent' : 'failed',
      });
      if (result.ok) {
        await db.update(conversations)
          .set({ lastMessageAt: new Date(), unread: false })
          .where(eq(conversations.id, conversationId));
      }
    } catch { /* registro é best-effort; o envio já ocorreu */ }
  }

  return result.ok
    ? Response.json({ sent: true, sid: result.providerId, to: recipient, testMode: !!testTo })
    : Response.json({ sent: false, error: result.error }, { status: 502 });
}
