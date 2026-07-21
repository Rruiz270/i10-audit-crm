import type { NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { rateLimitByIp } from '@/lib/rate-limit';

// ─── /api/marketing/webhooks/lp-interest — captura de interesse SEM formulário ──
// A LP personalizada por ?m=<ibge> chama este endpoint quando o visitante clica
// em "Quero meu relatório". Não há cadastro: capturamos a CIDADE e, para todos
// os contatos daquela cidade na régua do projeto:
//   1. Tag de signup (highlight no BI)
//   2. Migração da sequência pré (não-clicaram) → pós (inscritos)
//   3. Oportunidade no pipeline crm (1 por cidade, idempotente)
//   4. Evento 'lp_report_request' em marketing.events (BI: quais cidades pediram)
//
// Payload (POST JSON): { projectSlug | projectId, ibge, municipio? }
// CORS aberto (LP roda em institutoi10.com.br).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  // Público (CORS *) — limita flood por IP.
  const rl = await rateLimitByIp('webhook:lp-interest', { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: 'rate limited' },
      { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const sql = neon(process.env.DATABASE_URL!);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400, headers: CORS_HEADERS });
  }

  const ibge = String(body.ibge ?? '').replace(/\D/g, '').slice(0, 7);
  if (!ibge) {
    return Response.json({ ok: false, error: 'ibge required' }, { status: 400, headers: CORS_HEADERS });
  }

  // Log do webhook recebido (debug/auditoria)
  await sql`insert into marketing.webhook_log (provider, event_type, raw_payload)
            values ('lp-interest', 'report_click', ${JSON.stringify(body)}::jsonb)`;

  try {
    // Resolve projeto (slug ou id) + settings
    const projRows = body.projectId
      ? await sql`select id, slug, settings from marketing.projects where id = ${Number(body.projectId)} limit 1`
      : await sql`select id, slug, settings from marketing.projects where slug = ${String(body.projectSlug ?? '')} limit 1`;
    const project = projRows[0];
    if (!project) throw new Error('project not found (projectId or projectSlug required)');

    const settings = (project.settings ?? {}) as {
      preSequenceId?: number;
      posSequenceId?: number;
      signupTag?: string;
      createOpportunity?: boolean;
    };
    const signupTag = settings.signupTag ?? `${project.slug}:signup`;

    // Contatos daquela cidade que estão na régua do projeto (pré OU pós sequência),
    // ativos. São esses que migram/recebem a tag.
    const seqIds = [settings.preSequenceId, settings.posSequenceId].filter(
      (n): n is number => typeof n === 'number',
    );
    const cityContacts = seqIds.length
      ? await sql`
          select distinct c.id, c.email, c.name, c.municipio
          from marketing.contacts c
          join marketing.sequence_members m on m.contact_id = c.id
          where c.ibge = ${ibge}
            and m.sequence_id = ANY(${seqIds})
            and m.exited_at is null`
      : await sql`select id, email, name, municipio from marketing.contacts where ibge = ${ibge}`;

    const municipio = String(body.municipio ?? cityContacts[0]?.municipio ?? '');
    const contactIds = cityContacts.map((c) => Number(c.id));

    // 1+2) Tag de signup + migração pré→pós (por contato)
    let migrated = 0;
    for (const cid of contactIds) {
      // tag (merge no attributes.tags, sem duplicar)
      await sql`
        update marketing.contacts
        set attributes = jsonb_set(
              coalesce(attributes, '{}'::jsonb), '{tags}',
              coalesce(attributes->'tags', '[]'::jsonb) ||
                (case when coalesce(attributes->'tags','[]'::jsonb) @> ${JSON.stringify([signupTag])}::jsonb
                      then '[]'::jsonb else ${JSON.stringify([signupTag])}::jsonb end)),
            updated_at = now()
        where id = ${cid}`;

      // sai da pré-sequência (não-clicaram)
      if (settings.preSequenceId) {
        await sql`update marketing.sequence_members set exited_at = now(), exit_reason = ${`tag:${signupTag}`}
                  where sequence_id = ${settings.preSequenceId} and contact_id = ${cid} and exited_at is null`;
      }
      // entra na pós-sequência (inscritos) — step 0, dispara o "Reservamos seu relatório" já
      if (settings.posSequenceId) {
        const already = await sql`select 1 from marketing.sequence_members
          where sequence_id = ${settings.posSequenceId} and contact_id = ${cid} and exited_at is null limit 1`;
        if (already.length === 0) {
          await sql`insert into marketing.sequence_members (sequence_id, contact_id, current_step, enrolled_at, next_send_at)
                    values (${settings.posSequenceId}, ${cid}, 0, now(), now())`;
        }
      }
      migrated++;
    }

    // 4) Evento de BI: cidade pediu relatório (1 por clique).
    // events.send_id é NOT NULL → amarra ao send mais recente do contato (ex.: E1).
    // Não-fatal: se falhar, segue p/ a oportunidade.
    const primaryContactId = contactIds[0] ?? null;
    try {
      if (primaryContactId) {
        const lastSend = await sql`select id from marketing.sends where contact_id = ${primaryContactId} order by id desc limit 1`;
        const sendId = (lastSend[0]?.id as number) ?? null;
        if (sendId) {
          await sql`insert into marketing.events (send_id, contact_id, type, payload, metadata)
                    values (${sendId}, ${primaryContactId}, 'lp_report_request',
                            ${JSON.stringify({ ibge, municipio, projectSlug: project.slug, contactsMigrated: migrated })}::jsonb,
                            ${JSON.stringify({ source: 'lp_button', ip: request.headers.get('x-forwarded-for')?.split(',')[0] ?? null })}::jsonb)`;
        }
      }
    } catch (err) {
      console.error('[lp-interest event] falhou (interesse preservado):', err);
    }

    // 3) Oportunidade no pipeline (1 por cidade, idempotente por ibge+source)
    let opportunityCreated = false;
    if (settings.createOpportunity) {
      try {
        const src = `lp_${project.slug}`;
        // municipality_id pelo ibge
        let municipalityId: number | null = null;
        try {
          const muni = await sql`select id from fundeb.municipalities where codigo_ibge::text = ${ibge} limit 1`;
          municipalityId = (muni[0]?.id as number) ?? null;
        } catch {
          municipalityId = null;
        }
        // idempotente: 1 oportunidade por município nesta origem
        const existing = municipalityId
          ? await sql`select 1 from crm.opportunities where municipality_id = ${municipalityId} and source = ${src} limit 1`
          : await sql`select 1 from crm.opportunities where source = ${src} and notes ilike ${`%${municipio}%`} limit 1`;
        if (existing.length === 0) {
          const owner = await sql`
            select id from crm.users where role = 'consultor' and is_active = true
            order by (select count(*) from crm.opportunities o where o.owner_id = crm.users.id) asc, id asc limit 1`;
          const ownerId = (owner[0]?.id as number) ?? null;
          const notes = `Clicou "Quero meu relatório" na LP (${project.slug}). Município: ${municipio} (IBGE ${ibge}). ${migrated} contato(s) na régua.`;
          const opp = await sql`insert into crm.opportunities (municipality_id, owner_id, stage, source, notes)
                                values (${municipalityId}, ${ownerId}, 'novo', ${src}, ${notes}) returning id`;
          const oppId = opp[0].id;
          const primary = cityContacts[0];
          if (primary) {
            await sql`insert into crm.contacts (opportunity_id, name, email, role, is_primary)
                      values (${oppId}, ${primary.name ?? municipio}, ${primary.email ?? null}, 'prefeitura', true)`;
          }
          await sql`insert into crm.activities (opportunity_id, type, subject, body, metadata)
                    values (${oppId}, 'lp_click', 'Pediu relatório na LP',
                            ${`Cidade ${municipio} clicou no botão da LP ${project.slug}.`},
                            ${JSON.stringify({ source: src, ibge, contactsMigrated: migrated })}::jsonb)`;
          opportunityCreated = true;
        }
      } catch (err) {
        console.error('[lp-interest opp-bridge] falhou (interesse preservado):', err);
      }
    }

    return Response.json(
      { ok: true, municipio, ibge, contactsMigrated: migrated, opportunityCreated },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400, headers: CORS_HEADERS });
  }
}
