import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stats públicos (read-only, agregados por município — sem PII) para o dashboard
// estático em institutoi10.com.br/<campanha>-smart/dashboard-bi.html.
//   GET /api/marketing/public/stats?slug=sorocaba-2026

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60",
};

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return Response.json({ error: "missing slug" }, { status: 400, headers: CORS });
  }
  const sql = neon(process.env.DATABASE_URL!);

  const proj = (await sql`SELECT id FROM marketing.projects WHERE slug = ${slug}`) as Array<{ id: number }>;
  if (!proj.length) {
    return Response.json({ error: "project not found" }, { status: 404, headers: CORS });
  }
  const projectId = proj[0].id;

  // Status por município (precedência: inscrito > clicou > aberto > enviado > pendente)
  const rows = (await sql`
    WITH aud AS (
      SELECT id FROM marketing.audiences
      WHERE project_id = ${projectId} AND source = 'crm_hub'
      ORDER BY id LIMIT 1
    ),
    members AS (
      SELECT c.id AS contact_id, c.ibge, c.municipio
      FROM marketing.list_members lm
      JOIN marketing.contacts c ON c.id = lm.contact_id
      WHERE lm.audience_id = (SELECT id FROM aud) AND c.ibge IS NOT NULL
    ),
    ev AS (
      SELECT s.contact_id,
             bool_or(e.type = 'open')  AS opened,
             bool_or(e.type = 'click') AS clicked
      FROM marketing.events e
      JOIN marketing.sends s ON s.id = e.send_id
      WHERE s.contact_id IN (SELECT contact_id FROM members)
      GROUP BY s.contact_id
    ),
    snt AS (
      SELECT DISTINCT contact_id FROM marketing.sends
      WHERE status IN ('sent','delivered') AND contact_id IN (SELECT contact_id FROM members)
    ),
    trA AS (
      SELECT DISTINCT sm.contact_id
      FROM marketing.sequence_members sm
      JOIN marketing.sequences sq ON sq.id = sm.sequence_id
      WHERE sq.project_id = ${projectId} AND sq.name LIKE 'Trilha A%'
    )
    SELECT m.ibge,
           bool_or(snt.contact_id IS NOT NULL) AS sent,
           bool_or(COALESCE(ev.opened, false)) AS opened,
           bool_or(COALESCE(ev.clicked, false)) AS clicked,
           bool_or(trA.contact_id IS NOT NULL) AS inscrito
    FROM members m
    LEFT JOIN snt ON snt.contact_id = m.contact_id
    LEFT JOIN ev  ON ev.contact_id  = m.contact_id
    LEFT JOIN trA ON trA.contact_id = m.contact_id
    GROUP BY m.ibge
  `) as Array<{ ibge: string; sent: boolean; opened: boolean; clicked: boolean; inscrito: boolean }>;

  // "Inscrito / quer o relatório" = município que CLICOU na LP (intenção real).
  const byIbge: Record<string, { statusKey: string; status: string; trilha: string }> = {};
  let reachedMunis = 0, openedMunis = 0, clickedMunis = 0, inscritosMunis = 0;
  for (const r of rows) {
    let key = "pendente", label = "Pendente", trilha = "—";
    if (r.sent) { key = "enviado"; label = "Enviado"; trilha = "B"; reachedMunis++; }
    if (r.opened) { key = "aberto"; label = "Abriu"; openedMunis++; }
    if (r.clicked) { key = "inscrito"; label = "Quer relatório"; trilha = "A"; clickedMunis++; inscritosMunis++; }
    byIbge[r.ibge] = { statusKey: key, status: label, trilha };
  }

  // Totais por CONTATO (para os KPIs baterem com o CRM)
  const ct = (await sql`
    WITH aud AS (
      SELECT id FROM marketing.audiences
      WHERE project_id = ${projectId} AND source = 'crm_hub' ORDER BY id LIMIT 1
    ),
    members AS (
      SELECT lm.contact_id FROM marketing.list_members lm WHERE lm.audience_id = (SELECT id FROM aud)
    )
    SELECT
      (SELECT count(*) FROM members) AS audience,
      (SELECT count(DISTINCT contact_id) FROM marketing.sends
        WHERE status IN ('sent','delivered') AND contact_id IN (SELECT contact_id FROM members)) AS sent,
      (SELECT count(DISTINCT s.contact_id) FROM marketing.events e JOIN marketing.sends s ON s.id = e.send_id
        WHERE e.type = 'open' AND s.contact_id IN (SELECT contact_id FROM members)) AS opened,
      (SELECT count(DISTINCT s.contact_id) FROM marketing.events e JOIN marketing.sends s ON s.id = e.send_id
        WHERE e.type = 'click' AND s.contact_id IN (SELECT contact_id FROM members)) AS clicked,
      -- Inscritos = quem clicou na LP (intenção real de querer o relatório)
      (SELECT count(DISTINCT e.contact_id) FROM marketing.events e
        WHERE e.type = 'click' AND e.contact_id IN (SELECT contact_id FROM members)) AS inscritos
  `) as Array<{ audience: number; sent: number; opened: number; clicked: number; inscritos: number }>;
  const c = ct[0];

  // Lista de quem CLICOU na LP (inscritos): município, departamento (cargo), e-mail.
  const ROLE: Record<string, string> = {
    prefeito: "Prefeito / Gabinete", prefeito_pessoal: "Prefeito (pessoal)",
    presidente_camara: "Câmara", secretario_educacao: "Sec. Educação",
    secretario_financas: "Sec. Finanças", outros: "Outras secretarias",
  };
  const clickerRows = (await sql`
    WITH aud AS (
      SELECT id FROM marketing.audiences
      WHERE project_id = ${projectId} AND source = 'crm_hub' ORDER BY id LIMIT 1
    ),
    members AS (
      SELECT lm.contact_id FROM marketing.list_members lm WHERE lm.audience_id = (SELECT id FROM aud)
    )
    SELECT c.municipio, c.ibge, coalesce(c.role,'') AS role, c.email,
           coalesce(c.attributes->>'valor_potencial','') AS potencial,
           to_char(min(e.occurred_at) AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') AS quando
    FROM marketing.events e
    JOIN marketing.contacts c ON c.id = e.contact_id
    WHERE e.type = 'click' AND c.role <> 'teste'
      AND e.contact_id IN (SELECT contact_id FROM members)
    GROUP BY c.municipio, c.ibge, c.role, c.email, c.attributes->>'valor_potencial'
    ORDER BY c.municipio, c.email
  `) as Array<{ municipio: string; ibge: string; role: string; email: string; potencial: string; quando: string }>;
  const clickers = clickerRows.map((r) => ({
    municipio: r.municipio, ibge: r.ibge, departamento: ROLE[r.role] ?? r.role,
    email: r.email, potencial: r.potencial, quando: r.quando,
  }));

  // ── Timeline de e-mails: estado real por etapa (recebeu / enviando agora / agendado)
  // current_step > i  => já recebeu o e-mail i ; current_step == i => aguardando o i.
  const stepDist = (await sql`
    SELECT sq.name AS seq, sm.current_step AS step, (sm.exited_at IS NOT NULL) AS exited, count(*)::int AS n
    FROM marketing.sequence_members sm
    JOIN marketing.sequences sq ON sq.id = sm.sequence_id
    WHERE sq.project_id = ${projectId} AND sq.name NOT ILIKE 'PREVIEW%'
    GROUP BY sq.name, sm.current_step, exited
  `) as Array<{ seq: string; step: number; exited: boolean; n: number }>;
  // recebeu o e-mail i = qualquer membro (ativo ou que saiu) com step > i
  const sentAt = (rows2: Array<{ step: number; n: number }>, i: number) =>
    rows2.filter((r) => r.step > i).reduce((s, r) => s + r.n, 0);
  // aguardando o e-mail i = só membros ATIVOS parados nesse step (quem saiu não espera)
  const waitingAt = (rows2: Array<{ step: number; exited: boolean; n: number }>, i: number) =>
    rows2.filter((r) => r.step === i && !r.exited).reduce((s, r) => s + r.n, 0);
  const stateOf = (sent: number, waiting: number) =>
    sent > 0 && waiting === 0 ? "done" : sent > 0 || waiting > 0 ? "active" : "pending";
  // Duas topologias de campanha convivem:
  //  · Sorocaba: uma "Trilha B" única (step0=E1, steps1-4=B1-B4).
  //  · Marília: E1 numa seq própria ("BASE · E1") + B1-B4 noutra ("BASE · B1-B4", steps0-3).
  // Casamos por NOME (ignorando as PREVIEW e a antiga "Trilha B" congelada da Marília).
  const A = stepDist.filter((r) => /^Trilha A/i.test(r.seq));
  const trB = stepDist.filter((r) => /^Trilha B/i.test(r.seq));
  const e1Seq = stepDist.filter((r) => /E1/i.test(r.seq));
  const b14Seq = stepDist.filter((r) => /B1-?B4/i.test(r.seq));
  const e1src = e1Seq.length ? e1Seq : trB; // E1 dedicado (Marília) ou step0 da Trilha B (Sorocaba)
  const bUsesBase = b14Seq.length > 0;
  const bsrc = bUsesBase ? b14Seq : trB; // B1-B4 dedicado (steps 0-3) ou Trilha B (steps 1-4)
  const bOff = bUsesBase ? 0 : 1;
  // ordem de exibição igual ao HTML: E1, A1, A2, A3, A4, B1, B2, B3, B4
  const node = (key: string, rows2: typeof A, i: number) => {
    const sent = sentAt(rows2, i), waiting = waitingAt(rows2, i);
    return { key, sent, state: stateOf(sent, waiting) };
  };
  const timeline = [
    node("e1", e1src, 0),
    node("a1", A, 0), node("a2", A, 1), node("a3", A, 2), node("a4", A, 3),
    node("b1", bsrc, bOff + 0), node("b2", bsrc, bOff + 1),
    node("b3", bsrc, bOff + 2), node("b4", bsrc, bOff + 3),
  ];

  return Response.json(
    {
      project: slug,
      updatedAt: new Date().toISOString(),
      // por contato (KPIs / funil)
      contacts: {
        audience: Number(c.audience),
        sent: Number(c.sent),
        opened: Number(c.opened),
        clicked: Number(c.clicked),
        inscritos: Number(c.inscritos),
      },
      // por município (cards de cobertura)
      munis: {
        total: rows.length,
        reached: reachedMunis,
        opened: openedMunis,
        clicked: clickedMunis,
        inscritos: inscritosMunis,
      },
      byIbge,
      clickers,
      timeline,
    },
    { headers: CORS },
  );
}
