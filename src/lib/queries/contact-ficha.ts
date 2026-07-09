import { desc, eq, sql, inArray, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  contacts as mk,
  conversations,
  messages,
  sends,
  campaigns,
  events,
} from '@/lib/schema-marketing';
import {
  contacts as crmContacts,
  opportunities,
  fundebMunicipalities,
  activities,
  meetings,
} from '@/lib/schema';
import { requireUser } from '@/lib/session';

// ─── Ficha Contato 360 — header + resumo + TIMELINE UNIFICADA ───────────────
// Junta numa única linha do tempo tudo que aconteceu com a pessoa:
//   marketing.sends/events (campanhas: enviado/entregue/lido/clicou)
//   marketing.conversations/messages (inbox WhatsApp, in e out)
//   crm.activities/meetings (via ponte marketing_contact_id → opps)

export type TimelineItem = {
  at: Date;
  src: 'marketing' | 'inbox' | 'crm';
  kind: string; // send | event:<type> | msg:in | msg:out | activity:<type> | meeting
  title: string;
  detail?: string | null;
};

const EVENT_PT: Record<string, string> = {
  read: 'Leu',
  delivered: 'Recebeu',
  replied: 'Respondeu a',
  failed: 'Falhou',
  open: 'Abriu',
  click: 'Clicou em',
  download: 'Baixou material de',
  bounce_hard: 'E-mail devolvido (hard) —',
  bounce_soft: 'E-mail devolvido (soft) —',
  unsubscribed: 'Descadastrou-se de',
};

export async function getContactFicha(id: number) {
  await requireUser();

  const [contact] = await db.select().from(mk).where(eq(mk.id, id)).limit(1);
  if (!contact) return null;

  // Opps via ponte
  const oppRows = await db
    .select({
      oppId: opportunities.id,
      stage: opportunities.stage,
      municipio: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
      createdAt: opportunities.createdAt,
    })
    .from(crmContacts)
    .innerJoin(opportunities, eq(crmContacts.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(eq(crmContacts.marketingContactId, id));
  const oppIds = [...new Set(oppRows.map((o) => o.oppId))];

  // Conversa WhatsApp aberta (pra ação rápida "abrir inbox")
  const [conv] = await db
    .select({ id: conversations.id, lastInboundAt: conversations.lastInboundAt })
    .from(conversations)
    .where(and(eq(conversations.contactId, id), eq(conversations.channel, 'whatsapp')))
    .limit(1);

  // ── Timeline: 5 fontes em paralelo, merge em JS ──
  const sendsPromise = db
    .select({
      at: sql<Date>`coalesce(${sends.sentAt}, ${sends.queuedAt})`,
      status: sends.status,
      campaign: campaigns.name,
    })
    .from(sends)
    .leftJoin(campaigns, eq(sends.campaignId, campaigns.id))
    .where(eq(sends.contactId, id))
    .orderBy(desc(sql`coalesce(${sends.sentAt}, ${sends.queuedAt})`))
    .limit(30);

  const eventsPromise = db
    .select({
      at: events.occurredAt,
      type: events.type,
      campaign: campaigns.name,
    })
    .from(events)
    .innerJoin(sends, eq(events.sendId, sends.id))
    .leftJoin(campaigns, eq(sends.campaignId, campaigns.id))
    .where(eq(events.contactId, id))
    .orderBy(desc(events.occurredAt))
    .limit(30);

  const msgsPromise = db
    .select({
      at: messages.createdAt,
      direction: messages.direction,
      body: messages.body,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(conversations.contactId, id), sql`${messages.deletedAt} IS NULL`))
    .orderBy(desc(messages.createdAt))
    .limit(30);

  const actsPromise = oppIds.length
    ? db
        .select({
          at: activities.occurredAt,
          type: activities.type,
          subject: activities.subject,
          body: activities.body,
        })
        .from(activities)
        .where(inArray(activities.opportunityId, oppIds))
        .orderBy(desc(activities.occurredAt))
        .limit(30)
    : Promise.resolve([]);

  const meetsPromise = oppIds.length
    ? db
        .select({
          at: meetings.scheduledAt,
          title: meetings.title,
          outcome: meetings.outcome,
        })
        .from(meetings)
        .where(inArray(meetings.opportunityId, oppIds))
        .orderBy(desc(meetings.scheduledAt))
        .limit(15)
    : Promise.resolve([]);

  const [sendRows, eventRows, msgRows, actRows, meetRows] = await Promise.all([
    sendsPromise,
    eventsPromise,
    msgsPromise,
    actsPromise,
    meetsPromise,
  ]);

  const timeline: TimelineItem[] = [];
  for (const s of sendRows) {
    if (!s.at) continue;
    timeline.push({
      at: new Date(s.at),
      src: 'marketing',
      kind: `send:${s.status}`,
      title: `Campanha “${s.campaign ?? '—'}” — ${s.status}`,
    });
  }
  for (const e of eventRows) {
    if (!e.at) continue;
    timeline.push({
      at: new Date(e.at),
      src: 'marketing',
      kind: `event:${e.type}`,
      title: `${EVENT_PT[e.type] ?? e.type} “${e.campaign ?? 'campanha'}”`,
    });
  }
  for (const m of msgRows) {
    if (!m.at) continue;
    const excerpt = (m.body ?? '').slice(0, 90);
    timeline.push({
      at: new Date(m.at),
      src: 'inbox',
      kind: m.direction === 'inbound' ? 'msg:in' : 'msg:out',
      title: m.direction === 'inbound' ? 'Respondeu no WhatsApp' : 'Mensagem enviada (inbox)',
      detail: excerpt ? `“${excerpt}${(m.body ?? '').length > 90 ? '…' : ''}”` : null,
    });
  }
  for (const a of actRows) {
    if (!a.at) continue;
    timeline.push({
      at: new Date(a.at),
      src: 'crm',
      kind: `activity:${a.type}`,
      title: a.subject ?? a.type,
      detail: a.body ? a.body.slice(0, 120) : null,
    });
  }
  for (const mt of meetRows) {
    if (!mt.at) continue;
    timeline.push({
      at: new Date(mt.at),
      src: 'crm',
      kind: 'meeting',
      title: `Reunião: ${mt.title ?? '—'}`,
      detail: mt.outcome ? `resultado: ${mt.outcome}` : null,
    });
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Resumo
  const reads = eventRows.filter((e) => e.type === 'read' || e.type === 'open').length;
  const clicks = eventRows.filter((e) => e.type === 'click').length;
  const inbound = msgRows.filter((m) => m.direction === 'inbound').length;

  return {
    contact,
    opps: oppRows,
    conversationId: conv?.id ?? null,
    windowOpen: Boolean(
      conv?.lastInboundAt &&
        Date.now() - new Date(conv.lastInboundAt).getTime() < 24 * 60 * 60 * 1000,
    ),
    summary: {
      campaigns: sendRows.length,
      reads,
      clicks,
      conversations: inbound > 0 ? 1 : 0,
      inboundMessages: inbound,
      meetings: meetRows.length,
      activities: actRows.length,
    },
    timeline: timeline.slice(0, 60),
  };
}
