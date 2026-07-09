import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  contacts as mk,
  conversations,
  suppressions,
} from '@/lib/schema-marketing';
import { contacts as crmContacts } from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { phoneMatchKey } from '@/lib/phone-utils';

// ─── Contatos 360 — camada de dados da BASE ÚNICA ───────────────────────────
// A tela Contatos lê marketing.contacts (Leads Hub, 16k+): toda pessoa que já
// entrou por CSV, formulário, evento APM ou manualmente. Cada linha é
// enriquecida com o que o CRM sabe dela (opps via ponte marketing_contact_id)
// e com a última interação (campanhas/inbox). Módulo de leitura (não
// 'use server') — importado por server components.

export const CONTACTS_PAGE_SIZE = 50;

export type ContactFilters = {
  q?: string;
  role?: string;
  uf?: string;
  source?: string;
  seg?: string; // 'interacted' | 'inopp' | 'never'
  page?: number;
};

export type ContactRow = {
  id: number;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  municipio: string | null;
  uf: string | null;
  source: string | null;
  status: string | null;
  waState: 'ok' | 'unk' | 'bad';
  conversationId: number | null;
  lastInteraction: { kind: string; label: string; at: Date } | null;
  oppCount: number;
  oppWon: boolean;
};

const INTERACTED = sql`(EXISTS (SELECT 1 FROM marketing.events ev WHERE ev.contact_id = ${mk.id})
  OR EXISTS (SELECT 1 FROM marketing.conversations cv WHERE cv.contact_id = ${mk.id} AND cv.last_inbound_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM crm.contacts cc JOIN crm.activities a ON a.opportunity_id = cc.opportunity_id
             WHERE cc.marketing_contact_id = ${mk.id}
               AND a.type IN ('call','email','whatsapp','note','proposal','proposal_sent','diagnostic_sent')))`;
const IN_OPP = sql`EXISTS (SELECT 1 FROM crm.contacts cc WHERE cc.marketing_contact_id = ${mk.id})`;
const NEVER = sql`(NOT EXISTS (SELECT 1 FROM marketing.sends s WHERE s.contact_id = ${mk.id})
  AND NOT EXISTS (SELECT 1 FROM marketing.conversations cv WHERE cv.contact_id = ${mk.id})
  AND NOT EXISTS (SELECT 1 FROM crm.contacts cc JOIN crm.activities a ON a.opportunity_id = cc.opportunity_id
                  WHERE cc.marketing_contact_id = ${mk.id}
                    AND a.type IN ('call','email','whatsapp','note','proposal','proposal_sent','diagnostic_sent')))`;

function buildConds(f: ContactFilters, exclude?: keyof ContactFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.q && exclude !== 'q') {
    const term = `%${f.q.trim()}%`;
    const c = or(
      ilike(mk.name, term),
      ilike(mk.email, term),
      ilike(mk.phone, term),
      ilike(mk.whatsapp, term),
      ilike(mk.municipio, term),
    );
    if (c) conds.push(c);
  }
  if (f.role && exclude !== 'role') conds.push(eq(mk.role, f.role));
  if (f.uf && exclude !== 'uf') conds.push(eq(mk.uf, f.uf));
  if (f.source && exclude !== 'source') conds.push(eq(mk.source, f.source));
  if (f.seg && exclude !== 'seg') {
    if (f.seg === 'interacted') conds.push(INTERACTED);
    else if (f.seg === 'inopp') conds.push(IN_OPP);
    else if (f.seg === 'never') conds.push(NEVER);
  }
  return conds;
}

function facet(col: typeof mk.role | typeof mk.uf | typeof mk.source, conds: SQL[]) {
  const where = conds.length ? and(sql`${col} IS NOT NULL`, ...conds) : sql`${col} IS NOT NULL`;
  return db
    .select({ value: col, count: sql<number>`count(*)::int` })
    .from(mk)
    .where(where)
    .groupBy(col)
    .orderBy(sql`count(*) desc`)
    .limit(30);
}

const EVENT_LABEL: Record<string, string> = {
  read: 'Leu mensagem WhatsApp',
  delivered: 'Recebeu WhatsApp',
  replied: 'Respondeu no WhatsApp',
  failed: 'Falha de envio',
  open: 'Abriu e-mail',
  click: 'Clicou em e-mail',
  download: 'Baixou material',
  bounce_hard: 'E-mail devolveu (hard)',
  bounce_soft: 'E-mail devolveu (soft)',
  unsubscribed: 'Descadastrou-se',
};

export async function getContactsHubData(f: ContactFilters) {
  await requireUser();
  const page = Math.max(0, f.page ?? 0);

  // KPIs — norte da base inteira.
  const kpiPromise = db
    .select({
      total: sql<number>`count(*)::int`,
      withEmail: sql<number>`count(*) FILTER (WHERE ${mk.email} IS NOT NULL)::int`,
      waValid: sql<number>`count(*) FILTER (WHERE ${mk.whatsapp} ~ '^\\+55\\d{11}$')::int`,
    })
    .from(mk);
  const interactedPromise = db.execute(
    sql`SELECT count(*)::int AS n FROM (
      SELECT contact_id FROM marketing.events WHERE contact_id IS NOT NULL
      UNION
      SELECT contact_id FROM marketing.conversations WHERE contact_id IS NOT NULL AND last_inbound_at IS NOT NULL
      UNION
      SELECT cc.marketing_contact_id FROM crm.contacts cc
        JOIN crm.activities a ON a.opportunity_id = cc.opportunity_id
        WHERE cc.marketing_contact_id IS NOT NULL
          AND a.type IN ('call','email','whatsapp','note','proposal','proposal_sent','diagnostic_sent')
    ) t`,
  );
  const inOppPromise = db
    .select({ n: sql<number>`count(DISTINCT ${crmContacts.marketingContactId})::int` })
    .from(crmContacts)
    .where(sql`${crmContacts.marketingContactId} IS NOT NULL`);
  const suppressedPromise = db
    .select({ n: sql<number>`count(*)::int` })
    .from(suppressions)
    .where(eq(suppressions.channel, 'whatsapp'));

  const tableConds = buildConds(f);
  const tableWhere = tableConds.length ? and(...tableConds) : undefined;

  const rowsPromise = db
    .select({
      id: mk.id,
      name: mk.name,
      role: mk.role,
      email: mk.email,
      phone: mk.phone,
      whatsapp: mk.whatsapp,
      municipio: mk.municipio,
      uf: mk.uf,
      source: mk.source,
      status: mk.status,
    })
    .from(mk)
    .where(tableWhere)
    .orderBy(desc(mk.createdAt), desc(mk.id))
    .limit(CONTACTS_PAGE_SIZE)
    .offset(page * CONTACTS_PAGE_SIZE);

  const totalPromise = db.select({ n: sql<number>`count(*)::int` }).from(mk).where(tableWhere);

  const [
    [kpiRow],
    interactedRes,
    [inOppRow],
    [suppRow],
    baseRows,
    [totalRow],
    roleF,
    ufF,
    sourceF,
  ] = await Promise.all([
    kpiPromise,
    interactedPromise,
    inOppPromise,
    suppressedPromise,
    rowsPromise,
    totalPromise,
    facet(mk.role, buildConds(f, 'role')),
    facet(mk.uf, buildConds(f, 'uf')),
    facet(mk.source, buildConds(f, 'source')),
  ]);

  // ── Enriquecimento da página (só os ids visíveis — 50) ──
  const ids = baseRows.map((r) => r.id);
  let lastEvents: Array<{ contactId: number; type: string; at: Date }> = [];
  let convs: Array<{ contactId: number; id: number; lastInboundAt: Date | null; lastMessageAt: Date | null }> = [];
  let opps: Array<{ mid: number; n: number; won: boolean }> = [];
  let waOkIds = new Set<number>();
  let suppKeys = new Set<string>();
  const crmActByContact = new Map<number, { label: string; at: Date }>();
  const crmActByMuni = new Map<string, { label: string; at: Date }>();

  if (ids.length) {
    const idList = sql.raw(ids.join(','));
    const muniList = [...new Set(baseRows.map((r) => (r.municipio ?? '').toLowerCase()).filter(Boolean))];
    const [evRes, cvRes, oppRes, waRes, suppRes, actRes, muniActRes] = await Promise.all([
      db.execute(
        sql`SELECT DISTINCT ON (contact_id) contact_id, type, occurred_at
            FROM marketing.events WHERE contact_id IN (${idList})
            ORDER BY contact_id, occurred_at DESC`,
      ),
      db.execute(
        sql`SELECT contact_id, id, last_inbound_at, last_message_at
            FROM marketing.conversations WHERE contact_id IN (${idList}) AND channel = 'whatsapp'`,
      ),
      db.execute(
        sql`SELECT cc.marketing_contact_id AS mid, count(*)::int AS n,
               bool_or(o.stage = 'ganhou') AS won
            FROM crm.contacts cc JOIN crm.opportunities o ON o.id = cc.opportunity_id
            WHERE cc.marketing_contact_id IN (${idList}) GROUP BY 1`,
      ),
      db.execute(
        sql`SELECT DISTINCT contact_id FROM marketing.events
            WHERE contact_id IN (${idList}) AND type IN ('delivered','read','replied')`,
      ),
      db.execute(sql`SELECT identifier FROM marketing.suppressions WHERE channel = 'whatsapp'`),
      // Atividades CRM da pessoa (via ponte): ligação, whatsapp manual, nota…
      db.execute(
        sql`SELECT DISTINCT ON (cc.marketing_contact_id) cc.marketing_contact_id AS mid,
               a.type, a.subject, a.occurred_at
            FROM crm.contacts cc JOIN crm.activities a ON a.opportunity_id = cc.opportunity_id
            WHERE cc.marketing_contact_id IN (${idList})
              AND a.type IN ('call','email','whatsapp','note','proposal','proposal_sent','diagnostic_sent')
            ORDER BY cc.marketing_contact_id, a.occurred_at DESC`,
      ),
      // Fallback: atividade na opp do MESMO MUNICÍPIO (contatos institucionais
      // sem ponte pessoal — ex.: "Prefeitura de X" — herdam a interação da opp)
      muniList.length
        ? db.execute(
            sql`SELECT DISTINCT ON (lower(m.nome)) lower(m.nome) AS muni, a.type, a.occurred_at
                FROM crm.opportunities o
                JOIN fundeb.municipalities m ON m.id = o.municipality_id
                JOIN crm.activities a ON a.opportunity_id = o.id
                WHERE lower(m.nome) IN (${sql.raw(muniList.map((m) => `'${m.replace(/'/g, "''")}'`).join(','))})
                  AND a.type IN ('call','email','whatsapp','note','proposal','proposal_sent','diagnostic_sent')
                ORDER BY lower(m.nome), a.occurred_at DESC`,
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const rowsOf = (r: unknown) => (r as { rows?: unknown[] }).rows ?? (r as unknown[]);
    lastEvents = (rowsOf(evRes) as Record<string, unknown>[]).map((r) => ({
      contactId: Number(r.contact_id),
      type: String(r.type),
      at: new Date(String(r.occurred_at)),
    }));
    convs = (rowsOf(cvRes) as Record<string, unknown>[]).map((r) => ({
      contactId: Number(r.contact_id),
      id: Number(r.id),
      lastInboundAt: r.last_inbound_at ? new Date(String(r.last_inbound_at)) : null,
      lastMessageAt: r.last_message_at ? new Date(String(r.last_message_at)) : null,
    }));
    opps = (rowsOf(oppRes) as Record<string, unknown>[]).map((r) => ({
      mid: Number(r.mid),
      n: Number(r.n),
      won: Boolean(r.won),
    }));
    waOkIds = new Set(
      (rowsOf(waRes) as Record<string, unknown>[]).map((r) => Number(r.contact_id)),
    );
    for (const r of rowsOf(suppRes) as Record<string, unknown>[]) {
      const k = phoneMatchKey(String(r.identifier));
      if (k) suppKeys.add(k);
    }
    const ACT_LABEL: Record<string, string> = {
      call: 'Ligação registrada',
      email: 'E-mail registrado',
      whatsapp: 'WhatsApp registrado',
      note: 'Anotação na oportunidade',
      proposal: 'Proposta',
      proposal_sent: 'Proposta enviada',
      diagnostic_sent: 'Diagnóstico enviado',
    };
    for (const r of rowsOf(actRes) as Record<string, unknown>[]) {
      crmActByContact.set(Number(r.mid), {
        label: ACT_LABEL[String(r.type)] ?? String(r.type),
        at: new Date(String(r.occurred_at)),
      });
    }
    for (const r of rowsOf(muniActRes) as Record<string, unknown>[]) {
      crmActByMuni.set(String(r.muni), {
        label: `${ACT_LABEL[String(r.type)] ?? String(r.type)} (opp do município)`,
        at: new Date(String(r.occurred_at)),
      });
    }
  }

  const evByContact = new Map(lastEvents.map((e) => [e.contactId, e]));
  const cvByContact = new Map(convs.map((c) => [c.contactId, c]));
  const oppByContact = new Map(opps.map((o) => [o.mid, o]));

  const rows: ContactRow[] = baseRows.map((r) => {
    const ev = evByContact.get(r.id) ?? null;
    const cv = cvByContact.get(r.id) ?? null;
    const opp = oppByContact.get(r.id) ?? null;
    const key = phoneMatchKey(r.whatsapp ?? r.phone);
    const suppressed = key ? suppKeys.has(key) : false;

    // última interação = mais recente entre último evento e última resposta no inbox
    let lastInteraction: ContactRow['lastInteraction'] = null;
    if (ev) lastInteraction = { kind: ev.type, label: EVENT_LABEL[ev.type] ?? ev.type, at: ev.at };
    if (cv?.lastInboundAt && (!lastInteraction || cv.lastInboundAt > lastInteraction.at)) {
      lastInteraction = { kind: 'replied', label: 'Respondeu no WhatsApp', at: cv.lastInboundAt };
    }
    // Atividade CRM da pessoa (ponte) e, na falta, da opp do mesmo município
    const crmAct = crmActByContact.get(r.id) ?? crmActByMuni.get((r.municipio ?? '').toLowerCase());
    if (crmAct && (!lastInteraction || crmAct.at > lastInteraction.at)) {
      lastInteraction = { kind: 'crm', label: crmAct.label, at: crmAct.at };
    }

    const hasPhone = Boolean(r.whatsapp ?? r.phone);
    const waState: ContactRow['waState'] = suppressed
      ? 'bad'
      : !hasPhone
        ? 'bad'
        : waOkIds.has(r.id) || Boolean(cv?.lastInboundAt)
          ? 'ok'
          : 'unk';

    return {
      ...r,
      waState,
      conversationId: cv?.id ?? null,
      lastInteraction,
      oppCount: opp?.n ?? 0,
      oppWon: opp?.won ?? false,
    };
  });

  const clean = (rs: { value: string | null; count: number }[]) =>
    rs
      .filter((r) => r.value != null && r.value !== '')
      .map((r) => ({ value: String(r.value), count: Number(r.count) }));

  const interactedRows = ((interactedRes as unknown as { rows?: Array<{ n: number }> }).rows ??
    []) as Array<{ n: number }>;

  return {
    kpis: {
      total: Number(kpiRow?.total ?? 0),
      withEmail: Number(kpiRow?.withEmail ?? 0),
      waValid: Number(kpiRow?.waValid ?? 0),
      interacted: Number(interactedRows[0]?.n ?? 0),
      inOpp: Number(inOppRow?.n ?? 0),
      suppressed: Number(suppRow?.n ?? 0),
    },
    rows,
    total: Number(totalRow?.n ?? 0),
    page,
    pageSize: CONTACTS_PAGE_SIZE,
    facets: { role: clean(roleF), uf: clean(ufF), source: clean(sourceF) },
  };
}
