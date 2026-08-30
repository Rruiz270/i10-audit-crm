import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── /api/marketing/public/impositivas-hub ─────────────────────────────────
// JSON que alimenta o painel institutoi10.com.br/impositivashub.
// "public" só no sentido de não usar sessão do CRM: exige a chave em
// IMPOSITIVAS_HUB_KEY, porque aqui há nome e município de cada presidente.
//
//   GET /api/marketing/public/impositivas-hub?key=…&slug=impositivas-sp

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}

type MuniRow = {
  municipio: string;
  ibge: string | null;
  presidente: string | null;
  contatos: number;
  com_whatsapp: boolean;
  entregue: boolean;
  abriu: boolean;
  clicou: boolean;
  baixou: boolean;
  inscreveu: boolean;
  wa_conversa: boolean;
  descadastrou: boolean;
  bounce: boolean;
  trilha: string | null;
  oportunidade: string | null;
  ultimo_evento: string | null;
  ultimo_evento_em: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? req.headers.get('x-hub-key');
  const expected = process.env.IMPOSITIVAS_HUB_KEY;
  if (!expected || key !== expected) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  }
  const slug = url.searchParams.get('slug') ?? 'impositivas-sp';

  const sql = neon(process.env.DATABASE_URL!);
  const proj = (await sql`SELECT id, name FROM marketing.projects WHERE slug = ${slug}`) as Array<{
    id: number;
    name: string;
  }>;
  if (!proj.length) {
    return Response.json({ error: 'project not found' }, { status: 404, headers: CORS });
  }
  const projectId = proj[0].id;

  // Um retrato por município: agrega o que aconteceu com todos os e-mails
  // daquela câmara (a planilha traz institucional + pessoal do presidente).
  const rows = (await sql`
    WITH membros AS (
      SELECT DISTINCT c.id, c.email, c.municipio, c.ibge, c.name, c.whatsapp, c.status,
             c.attributes
      FROM marketing.list_members lm
      JOIN marketing.audiences a ON a.id = lm.audience_id
      JOIN marketing.contacts c  ON c.id = lm.contact_id
      -- Audiências "ZZ …" são de teste interno: ficam fora dos números.
      WHERE a.project_id = ${projectId} AND a.name NOT LIKE 'ZZ %'
    ),
    env AS (
      SELECT s.contact_id,
             bool_or(s.status IN ('sent','delivered')) AS entregue,
             bool_or(s.status = 'bounced')             AS bounce,
             max(s.sent_at)                            AS ultimo_envio
      FROM marketing.sends s
      JOIN marketing.campaigns cp ON cp.id = s.campaign_id
      WHERE cp.project_id = ${projectId} AND s.contact_id IN (SELECT id FROM membros)
      GROUP BY s.contact_id
    ),
    ev AS (
      SELECT s.contact_id,
             bool_or(e.type = 'open')         AS abriu,
             bool_or(e.type = 'click')        AS clicou,
             bool_or(e.type = 'unsubscribed') AS descadastrou,
             max(e.occurred_at)               AS ultimo_ev,
             (array_agg(e.type ORDER BY e.occurred_at DESC))[1] AS ultimo_tipo
      FROM marketing.events e
      JOIN marketing.sends s     ON s.id = e.send_id
      JOIN marketing.campaigns cp ON cp.id = s.campaign_id
      WHERE cp.project_id = ${projectId} AND s.contact_id IN (SELECT id FROM membros)
      GROUP BY s.contact_id
    ),
    lp AS (
      SELECT contact_id,
             bool_or(type = 'download') AS baixou,
             bool_or(type = 'wa_click') AS wa_click,
             max(created_at)            AS ultimo_lp,
             (array_agg(type ORDER BY created_at DESC))[1] AS ultimo_tipo
      FROM marketing.lp_events
      WHERE project_id = ${projectId} AND contact_id IS NOT NULL
      GROUP BY contact_id
    ),
    insc AS (
      SELECT id AS contact_id FROM membros
      WHERE attributes->'tags' @> ${JSON.stringify([`${slug}:signup`])}::jsonb
    ),
    trilhaA AS (
      SELECT DISTINCT sm.contact_id
      FROM marketing.sequence_members sm
      JOIN marketing.sequences sq ON sq.id = sm.sequence_id
      WHERE sq.project_id = ${projectId} AND sq.name ILIKE 'Trilha A%' AND sm.exited_at IS NULL
    ),
    conv AS (
      SELECT DISTINCT m.id AS contact_id, cv.last_inbound_at
      FROM membros m
      -- Mesma regra do cron de trilhas (últimos 11 dígitos); se divergir, o
      -- painel e o piloto discordam sobre quem respondeu no WhatsApp.
      JOIN marketing.conversations cv
        ON right(regexp_replace(cv.wa_phone, '\\D', '', 'g'), 11)
         = right(regexp_replace(COALESCE(m.whatsapp, m.phone, ''), '\\D', '', 'g'), 11)
      WHERE COALESCE(m.whatsapp, m.phone) IS NOT NULL AND cv.last_inbound_at IS NOT NULL
    ),
    opp AS (
      SELECT lower(cc.email) AS email, max(oo.stage) AS stage
      FROM crm.contacts cc
      JOIN crm.opportunities oo ON oo.id = cc.opportunity_id
      WHERE oo.source = ${`lp_${slug}`}
      GROUP BY lower(cc.email)
    )
    SELECT m.municipio,
           max(m.ibge)                                        AS ibge,
           max(COALESCE(m.attributes->>'presidente', m.name))  AS presidente,
           count(*)::int                                       AS contatos,
           bool_or(m.whatsapp IS NOT NULL)                     AS com_whatsapp,
           bool_or(COALESCE(env.entregue, false))              AS entregue,
           bool_or(COALESCE(env.bounce, false))                AS bounce,
           bool_or(COALESCE(ev.abriu, false))                  AS abriu,
           bool_or(COALESCE(ev.clicou, false))                 AS clicou,
           bool_or(COALESCE(lp.baixou, false))                 AS baixou,
           bool_or(insc.contact_id IS NOT NULL)                AS inscreveu,
           bool_or(conv.contact_id IS NOT NULL OR COALESCE(lp.wa_click, false)) AS wa_conversa,
           bool_or(COALESCE(ev.descadastrou, false) OR m.status = 'unsubscribed') AS descadastrou,
           bool_or(trilhaA.contact_id IS NOT NULL)             AS em_trilha_a,
           max(opp.stage)                                      AS oportunidade,
           greatest(max(ev.ultimo_ev), max(lp.ultimo_lp), max(env.ultimo_envio)) AS ultimo_evento_em,
           (array_agg(COALESCE(lp.ultimo_tipo, ev.ultimo_tipo)
              ORDER BY greatest(lp.ultimo_lp, ev.ultimo_ev) DESC NULLS LAST))[1] AS ultimo_evento
    FROM membros m
    LEFT JOIN env     ON env.contact_id     = m.id
    LEFT JOIN ev      ON ev.contact_id      = m.id
    LEFT JOIN lp      ON lp.contact_id      = m.id
    LEFT JOIN insc    ON insc.contact_id    = m.id
    LEFT JOIN trilhaA ON trilhaA.contact_id = m.id
    LEFT JOIN conv    ON conv.contact_id    = m.id
    LEFT JOIN opp     ON opp.email          = lower(m.email)
    GROUP BY m.municipio
    ORDER BY m.municipio
  `) as unknown as Array<MuniRow & { em_trilha_a: boolean }>;

  // Campanhas do projeto (para o cabeçalho do painel)
  const camps = (await sql`
    SELECT c.id, c.name, c.status, c.scheduled_at, c.total_recipients, c.sent_count,
           c.open_count, c.click_count, c.bounce_count, c.unsubscribe_count, t.channel
    FROM marketing.campaigns c
    JOIN marketing.templates t ON t.id = c.template_id
    WHERE c.project_id = ${projectId}
      AND c.name NOT LIKE '[seq:%' AND c.name NOT LIKE 'ZZ TESTE%'
    ORDER BY c.scheduled_at NULLS LAST, c.id
  `) as Array<Record<string, unknown>>;

  const municipios = rows.map((r) => {
    // "Frio" só faz sentido depois de a peça ter chegado: antes do primeiro
    // disparo todo mundo é "não iniciado", senão o painel abre com 645 frios.
    const trilha = r.descadastrou
      ? 'opt-out'
      : r.em_trilha_a || r.inscreveu || r.clicou || r.baixou || r.wa_conversa
        ? 'A'
        : r.abriu
          ? 'observacao'
          : r.entregue
            ? 'B'
            : 'nao_iniciado';
    return { ...r, trilha };
  });

  const count = (fn: (m: (typeof municipios)[number]) => boolean) => municipios.filter(fn).length;
  const kpis = {
    base: municipios.length,
    com_whatsapp: count((m) => m.com_whatsapp),
    entregue: count((m) => m.entregue),
    abriu: count((m) => m.abriu),
    clicou: count((m) => m.clicou),
    baixou: count((m) => m.baixou),
    inscreveu: count((m) => m.inscreveu),
    wa_conversa: count((m) => m.wa_conversa),
    oportunidades: count((m) => Boolean(m.oportunidade)),
    bounce: count((m) => m.bounce),
    descadastrou: count((m) => m.descadastrou),
  };
  const trilhas = {
    A: count((m) => m.trilha === 'A'),
    B: count((m) => m.trilha === 'B'),
    observacao: count((m) => m.trilha === 'observacao'),
    optout: count((m) => m.trilha === 'opt-out'),
    nao_iniciado: count((m) => m.trilha === 'nao_iniciado'),
  };

  return Response.json(
    {
      projeto: proj[0].name,
      slug,
      atualizado_em: new Date().toISOString(),
      kpis,
      trilhas,
      campanhas: camps,
      municipios,
    },
    { headers: CORS },
  );
}
