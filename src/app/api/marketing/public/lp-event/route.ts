import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── /api/marketing/public/lp-event ────────────────────────────────────────
// Registra o que acontece na landing page: visita, download de material e
// clique no botão de WhatsApp. Chamado pelo próprio HTML da LP (navigator
// .sendBeacon / fetch), por isso é público e tolerante a erro — nunca deve
// atrapalhar a navegação de quem está na página.
//
//   POST { slug, type, material?, path?, t?, ibge?, municipio?, meta? }
//
// `t` é o tracking_token do send que trouxe a pessoa: é ele que liga a
// interação anônima na LP ao contato certo no funil.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TYPES = new Set(['visit', 'download', 'wa_click', 'form_open']);

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const slug = String(body.slug ?? '').trim();
    const type = String(body.type ?? '').trim();
    if (!slug || !TYPES.has(type)) {
      return Response.json({ error: 'slug e type válidos são obrigatórios' }, { status: 400, headers: CORS });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const proj = (await sql`SELECT id FROM marketing.projects WHERE slug = ${slug}`) as Array<{ id: number }>;
    if (!proj.length) {
      return Response.json({ error: 'project not found' }, { status: 404, headers: CORS });
    }
    const projectId = proj[0].id;

    // Resolve o contato pelo token do send (caminho feliz) ou, na ausência
    // dele, pelo IBGE — quem chegou pela LP sem passar por e-mail.
    const token = body.t ? String(body.t) : null;
    const ibge = body.ibge ? String(body.ibge).slice(0, 7) : null;
    let contactId: number | null = null;
    let sendId: number | null = null;

    if (token) {
      const s = (await sql`
        SELECT id, contact_id FROM marketing.sends WHERE tracking_token = ${token} LIMIT 1
      `) as Array<{ id: number; contact_id: number }>;
      if (s.length) {
        sendId = s[0].id;
        contactId = s[0].contact_id;
      }
    }
    if (!contactId && ibge) {
      const c = (await sql`
        SELECT id FROM marketing.contacts WHERE ibge = ${ibge} ORDER BY id LIMIT 1
      `) as Array<{ id: number }>;
      if (c.length) contactId = c[0].id;
    }

    // Visita é ruidosa: só a primeira de cada contato interessa ao funil.
    if (type === 'visit' && contactId) {
      const seen = (await sql`
        SELECT 1 FROM marketing.lp_events
        WHERE project_id = ${projectId} AND contact_id = ${contactId} AND type = 'visit' LIMIT 1
      `) as unknown[];
      if (seen.length) return Response.json({ ok: true, deduped: true }, { headers: CORS });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      null;

    await sql`
      INSERT INTO marketing.lp_events
        (project_id, contact_id, send_id, type, material, path, tracking_token, ibge, municipio, meta, user_agent, ip)
      VALUES
        (${projectId}, ${contactId}, ${sendId}, ${type},
         ${body.material ? String(body.material) : null},
         ${body.path ? String(body.path) : null},
         ${token}, ${ibge},
         ${body.municipio ? String(body.municipio) : null},
         ${JSON.stringify(body.meta ?? {})}::jsonb,
         ${req.headers.get('user-agent')}, ${ip})
    `;

    // Baixar material ou chamar no WhatsApp é intenção real: marca o contato
    // como engajado para o cron de trilhas promovê-lo à Trilha A.
    if (contactId && (type === 'download' || type === 'wa_click')) {
      await sql`
        UPDATE marketing.contacts
        SET attributes = jsonb_set(
              attributes,
              '{tags}',
              COALESCE(attributes->'tags', '[]'::jsonb) ||
                CASE WHEN COALESCE(attributes->'tags', '[]'::jsonb) @> ${JSON.stringify([`${slug}:engajado`])}::jsonb
                     THEN '[]'::jsonb ELSE ${JSON.stringify([`${slug}:engajado`])}::jsonb END
            ),
            updated_at = NOW()
        WHERE id = ${contactId}
      `;
    }

    return Response.json({ ok: true, contactId, sendId }, { headers: CORS });
  } catch (err) {
    console.error('[lp-event]', err);
    // A LP não deve quebrar por causa de telemetria.
    return Response.json({ ok: false }, { status: 200, headers: CORS });
  }
}
