import type { NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { launchCampaignCore } from '@/lib/marketing/launch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ─── /api/marketing/cron/webinar ───────────────────────────────────────────
// Piloto automático do webinar de emendas impositivas (29/09/2026). Disparado
// pelo GitHub Actions (.github/workflows/webinar.yml) a cada 15 min — nunca
// pela máquina de ninguém. Faz, em ordem:
//
//   1. AUDIÊNCIAS DINÂMICAS — reconstrói W-IN (inscritos), W-OUT (recebeu e
//      não se inscreveu), W-OUT com WhatsApp, e a bifurcação presente/ausente.
//      É esse recálculo que faz ninguém receber "inscreva-se" depois de já ter
//      se inscrito: a pessoa sai da trilha fria na rodada seguinte ao envio do
//      formulário.
//   2. AGENDADAS — campanhas com scheduled_at vencido saem do "scheduled" e
//      viram sends na fila.
//
// Idempotente: rodar duas vezes seguidas não duplica nada. As audiências são
// apagadas e reconstruídas inteiras, e launchCampaignCore recusa campanha que
// já esteja em sending/sent.

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return process.env.NODE_ENV !== 'production';
  return (request.headers.get('authorization') ?? '') === `Bearer ${process.env.CRON_SECRET}`;
}

const SLUG = 'webinar-impositivas';

type Settings = {
  signupTag?: string;
  audienceIds?: {
    vip?: number;
    base?: number;
    wa?: number;
    in?: number;
    out?: number;
    outWa?: number;
    presentes?: number;
    ausentes?: number;
    teste?: number;
  };
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
  const A = settings.audienceIds ?? {};
  const TAG = settings.signupTag ?? 'webinar:inscrito';

  // ─── 1. Audiências dinâmicas ─────────────────────────────────────────────
  const audiencias: Record<string, number> = {};

  async function recontar(audienceId: number, rotulo: string) {
    const n = (await sql`
      SELECT count(*)::int AS n FROM marketing.list_members WHERE audience_id = ${audienceId}
    `) as Array<{ n: number }>;
    if (!dryRun) {
      await sql`
        UPDATE marketing.audiences SET contact_count = ${n[0].n} WHERE id = ${audienceId}`;
    }
    audiencias[rotulo] = n[0].n;
  }

  // W-IN — tem a tag de inscrição. A tag entra pelo webhook do formulário, na
  // mesma transação que cria contato, consentimento e oportunidade.
  if (A.in && !dryRun) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${A.in}`;
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${A.in}::int, c.id FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
      ON CONFLICT DO NOTHING`;
  }
  if (A.in) await recontar(A.in, 'W-IN');

  // W-OUT — recebeu alguma peça DESTA campanha e não se inscreveu. "Recebeu"
  // e não "está na base": quem ainda não foi convidado não pode receber a
  // peça de conteúdo antes do convite.
  for (const [audienceId, soWa, rotulo] of [
    [A.out, false, 'W-OUT'],
    [A.outWa, true, 'W-OUT c/ WhatsApp'],
  ] as Array<[number | undefined, boolean, string]>) {
    if (!audienceId) continue;
    if (!dryRun) {
      await sql`DELETE FROM marketing.list_members WHERE audience_id = ${audienceId}`;
      await sql`
        INSERT INTO marketing.list_members (audience_id, contact_id)
        SELECT ${audienceId}::int, c.id
        FROM marketing.contacts c
        WHERE c.status = 'active'
          AND NOT (COALESCE(c.attributes->'tags', '[]'::jsonb) ? ${TAG})
          AND EXISTS (
            SELECT 1 FROM marketing.sends s
            JOIN marketing.campaigns ca ON ca.id = s.campaign_id
            WHERE s.contact_id = c.id AND ca.project_id = ${projectId}
          )
          AND NOT EXISTS (
            SELECT 1 FROM marketing.suppressions su
            WHERE su.identifier IN (c.email, c.whatsapp, c.phone)
          )
          AND c.id NOT IN (
            SELECT contact_id FROM marketing.list_members WHERE audience_id = ${A.teste ?? 0}
          )
          AND (${soWa}::boolean = false OR c.whatsapp IS NOT NULL)
        ON CONFLICT DO NOTHING`;
    }
    await recontar(audienceId, rotulo);
  }

  // Presente / ausente — só faz sentido depois do evento, quando o CSV do
  // relatório de presença do Meet tiver gravado attributes.webinar_presente.
  if (A.presentes && !dryRun) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${A.presentes}`;
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${A.presentes}::int, c.id FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
        AND (c.attributes->>'webinar_presente')::boolean IS TRUE
      ON CONFLICT DO NOTHING`;
  }
  if (A.presentes) await recontar(A.presentes, 'presentes');

  if (A.ausentes && !dryRun) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${A.ausentes}`;
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${A.ausentes}::int, c.id FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
        AND COALESCE((c.attributes->>'webinar_presente')::boolean, false) = false
      ON CONFLICT DO NOTHING`;
  }
  if (A.ausentes) await recontar(A.ausentes, 'ausentes');

  log.audiencias = audiencias;

  // ─── 2. Campanhas agendadas ──────────────────────────────────────────────
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
