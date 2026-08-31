import type { NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { launchCampaignCore } from '@/lib/marketing/launch';
import { ensureOpportunity } from '@/lib/marketing/opportunity-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ─── /api/marketing/cron/impositivas ───────────────────────────────────────
// O piloto automático da campanha Impositivas SP. Disparado pelo GitHub
// Actions (.github/workflows/impositivas.yml) a cada 15 min. Faz, em ordem:
//
//   1. TRILHA A — quem clicou, baixou material, se inscreveu ou respondeu no
//      WhatsApp entra na régua quente e vira oportunidade no pipeline.
//   2. TRILHA B — quem passou do corte sem clicar é marcado como frio; a
//      audiência da régua B é recalculada a cada rodada (é dinâmica: quem
//      esquentar no meio do caminho sai dela sozinho).
//   3. AGENDADAS — campanhas com scheduled_at vencido saem do "scheduled".
//
// Idempotente: rodar duas vezes seguidas não duplica nada.

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  return (request.headers.get('authorization') ?? '') === `Bearer ${process.env.CRON_SECRET}`;
}

const SLUG = 'impositivas-sp';

type Settings = {
  trilhaASequenceId?: number;
  /** Dono fixo das oportunidades da campanha (sem balanceamento). */
  opportunityOwnerId?: string;
  /** ISO date: antes disso ninguém é classificado como frio. */
  corteTrilhaB?: string;
  /** Nome (LIKE) das campanhas da régua B, cuja audiência é dinâmica. */
  audienciaTrilhaB?: string;
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';
  const sql = neon(process.env.DATABASE_URL!);
  const log: Record<string, unknown> = { dryRun, at: new Date().toISOString() };

  const proj = (await sql`
    SELECT id, settings FROM marketing.projects WHERE slug = ${SLUG}
  `) as Array<{ id: number; settings: Settings }>;
  if (!proj.length) return Response.json({ error: 'projeto não encontrado' }, { status: 404 });
  const projectId = proj[0].id;
  const settings = proj[0].settings ?? {};

  // ─── 1. Trilha A ─────────────────────────────────────────────────────────
  // Engajado = clicou em e-mail, baixou material/clicou no WhatsApp na LP,
  // se inscreveu no formulário, ou respondeu no WhatsApp.
  const engajados = (await sql`
    WITH membros AS (
      SELECT DISTINCT c.id, c.email, c.name, c.whatsapp, c.phone, c.municipio, c.ibge, c.attributes
      FROM marketing.list_members lm
      JOIN marketing.audiences a ON a.id = lm.audience_id
      JOIN marketing.contacts c  ON c.id = lm.contact_id
      -- Mesmo recorte do painel: audiências "ZZ …" são de teste interno e não
      -- podem gerar oportunidade no pipeline comercial.
      WHERE a.project_id = ${projectId} AND c.status = 'active'
        AND a.name NOT LIKE 'ZZ %'
    ),
    clicou AS (
      SELECT DISTINCT s.contact_id
      FROM marketing.events e
      JOIN marketing.sends s      ON s.id = e.send_id
      JOIN marketing.campaigns cp ON cp.id = s.campaign_id
      WHERE cp.project_id = ${projectId} AND e.type = 'click'
    ),
    lp AS (
      SELECT DISTINCT contact_id FROM marketing.lp_events
      WHERE project_id = ${projectId} AND type IN ('download','wa_click') AND contact_id IS NOT NULL
    ),
    inscrito AS (
      SELECT id AS contact_id FROM membros
      WHERE attributes->'tags' @> ${JSON.stringify([`${SLUG}:signup`])}::jsonb
         OR attributes->'tags' @> ${JSON.stringify([`${SLUG}:engajado`])}::jsonb
    ),
    respondeu AS (
      SELECT DISTINCT m.id AS contact_id
      FROM membros m
      -- Últimos 11 dígitos é a regra canônica de casamento de telefone do
      -- repo (contact-bridge): sem ela, contato salvo sem o 55 nunca casaria
      -- com a conversa salva em E.164.
      JOIN marketing.conversations cv
        ON right(regexp_replace(cv.wa_phone, '\\D', '', 'g'), 11)
         = right(regexp_replace(COALESCE(m.whatsapp, m.phone, ''), '\\D', '', 'g'), 11)
      WHERE COALESCE(m.whatsapp, m.phone) IS NOT NULL AND cv.last_inbound_at IS NOT NULL
    ),
    alvo AS (
      SELECT contact_id FROM clicou
      UNION SELECT contact_id FROM lp
      UNION SELECT contact_id FROM inscrito
      UNION SELECT contact_id FROM respondeu
    )
    SELECT m.id, m.email, m.name, m.whatsapp, m.municipio, m.ibge
    FROM membros m
    JOIN alvo ON alvo.contact_id = m.id
    WHERE NOT EXISTS (
      SELECT 1 FROM marketing.sequence_members sm
      JOIN marketing.sequences sq ON sq.id = sm.sequence_id
      WHERE sq.id = ${settings.trilhaASequenceId ?? 0} AND sm.contact_id = m.id
    )
  `) as Array<{
    id: number;
    email: string;
    name: string | null;
    whatsapp: string | null;
    municipio: string | null;
    ibge: string | null;
  }>;

  log.trilhaA_novos = engajados.length;

  if (!dryRun && settings.trilhaASequenceId && engajados.length) {
    // Matrícula e marcação são idênticas para todos: dois statements em lote,
    // não dois por contato — depois do E1 isso pode ser uma leva grande, e o
    // cron tem orçamento de tempo.
    const ids = engajados.map((c) => c.id);
    await sql`
      INSERT INTO marketing.sequence_members (sequence_id, contact_id, current_step, next_send_at)
      SELECT ${settings.trilhaASequenceId}, id, 0, NOW() + interval '1 day'
      FROM unnest(${ids}::int[]) AS id
    `;
    await sql`
      UPDATE marketing.contacts
      SET attributes = jsonb_set(attributes, '{trilha}', '"A"'::jsonb), updated_at = NOW()
      WHERE id = ANY(${ids}::int[])
    `;

    for (const c of engajados) {
      await ensureOpportunity({
        email: c.email,
        name: c.name,
        phone: c.whatsapp,
        ibge: c.ibge,
        municipio: c.municipio,
        source: `lp_${SLUG}`,
        notes: `Engajou na campanha Emendas Impositivas (Câmara de ${c.municipio ?? '—'}).`,
        activityType: 'marketing',
        activitySubject: 'Engajou na campanha Impositivas SP',
        activityBody: `Clique, download ou contato via LP/WhatsApp. E-mail: ${c.email}`,
        marketingContactId: c.id,
        ownerId: settings.opportunityOwnerId ?? null,
      });
    }
  }

  // ─── 2. Trilha B ─────────────────────────────────────────────────────────
  // A audiência da régua fria é reconstruída a cada rodada: entra quem já
  // recebeu algo, não está na Trilha A e não pediu descadastro.
  const corte = settings.corteTrilhaB ? new Date(settings.corteTrilhaB) : null;
  const corteVencido = corte ? Date.now() >= corte.getTime() : false;
  log.corteTrilhaB = settings.corteTrilhaB ?? null;
  log.corteVencido = corteVencido;

  if (corteVencido && settings.audienciaTrilhaB) {
    const audB = (await sql`
      SELECT id FROM marketing.audiences
      WHERE project_id = ${projectId} AND name = ${settings.audienciaTrilhaB} LIMIT 1
    `) as Array<{ id: number }>;
    if (audB.length) {
      const audienceId = audB[0].id;
      if (!dryRun) {
        await sql`DELETE FROM marketing.list_members WHERE audience_id = ${audienceId}`;
        await sql`
          INSERT INTO marketing.list_members (audience_id, contact_id)
          SELECT ${audienceId}, c.id
          FROM marketing.contacts c
          WHERE c.status = 'active'
            AND c.attributes->'tags' @> ${JSON.stringify([SLUG])}::jsonb
            AND COALESCE(c.attributes->>'trilha', '') <> 'A'
            AND EXISTS (
              SELECT 1 FROM marketing.sends s
              JOIN marketing.campaigns cp ON cp.id = s.campaign_id
              WHERE cp.project_id = ${projectId} AND s.contact_id = c.id
                AND s.status IN ('sent','delivered')
            )
          ON CONFLICT DO NOTHING
        `;
        await sql`
          UPDATE marketing.audiences SET contact_count =
            (SELECT count(*) FROM marketing.list_members WHERE audience_id = ${audienceId})
          WHERE id = ${audienceId}
        `;
      }
      const n = (await sql`
        SELECT count(*)::int AS n FROM marketing.list_members WHERE audience_id = ${audienceId}
      `) as Array<{ n: number }>;
      log.trilhaB_audiencia = n[0].n;
    }
  }

  // ─── 3. Campanhas agendadas ──────────────────────────────────────────────
  const due = (await sql`
    SELECT id, name FROM marketing.campaigns
    WHERE project_id = ${projectId} AND status = 'scheduled' AND scheduled_at <= NOW()
    ORDER BY scheduled_at
  `) as Array<{ id: number; name: string }>;
  log.agendadas_vencidas = due.map((d) => d.name);

  const lancadas: Array<Record<string, unknown>> = [];
  for (const c of due) {
    try {
      const r = await launchCampaignCore(c.id, { dryRun });
      lancadas.push({ campanha: c.name, ...r });
    } catch (err) {
      lancadas.push({ campanha: c.name, erro: err instanceof Error ? err.message : String(err) });
    }
  }
  log.lancadas = lancadas;

  return Response.json({ ok: true, ...log });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
