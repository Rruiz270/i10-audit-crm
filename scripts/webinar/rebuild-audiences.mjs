// Reconstrói as audiências dinâmicas do webinar. É o mecanismo inteiro do
// pedido: ninguém recebe "inscreva-se" depois de ter se inscrito.
//
//   node scripts/webinar/rebuild-audiences.mjs           # reconstrói
//   node scripts/webinar/rebuild-audiences.mjs --dry-run # só mostra os números
//
// Roda de graça quantas vezes quiser. O cron chama a mesma lógica pela rota
// /api/marketing/cron/webinar; aqui serve para conferir antes de armar e para
// destravar na mão se o cron falhar.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const SLUG = 'webinar-impositivas';
const dryRun = process.argv.includes('--dry-run');

const [proj] = await sql`SELECT id, settings FROM marketing.projects WHERE slug = ${SLUG} LIMIT 1`;
if (!proj) {
  console.error(`projeto ${SLUG} não existe — rode o seed antes.`);
  process.exit(1);
}
const A = proj.settings.audienceIds;
const TAG = proj.settings.signupTag ?? 'webinar:inscrito';

async function refill(audienceId, rotulo, selectFn) {
  const [{ n: antes }] = await sql`SELECT count(*)::int AS n FROM marketing.list_members WHERE audience_id = ${audienceId}`;
  const alvo = await selectFn(true);
  if (!dryRun) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${audienceId}`;
    await selectFn(false);
    await sql`
      UPDATE marketing.audiences
      SET contact_count = (SELECT count(*) FROM marketing.list_members WHERE audience_id = ${audienceId})
      WHERE id = ${audienceId}`;
  }
  const delta = alvo - antes;
  console.log(
    `${rotulo.padEnd(34)} ${String(antes).padStart(4)} → ${String(alvo).padStart(4)}` +
      (delta ? `  (${delta > 0 ? '+' : ''}${delta})` : ''),
  );
}

// ─── W-IN · quem se inscreveu ──────────────────────────────────────────────
// A tag entra pelo webhook do formulário, na mesma transação que cria contato,
// consentimento e oportunidade — não depende desta rodada para existir.
await refill(A.in, 'W-IN · inscritos', async (count) => {
  if (count) {
    const r = await sql`
      SELECT count(*)::int AS n FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}`;
    return r[0].n;
  }
  await sql`
    INSERT INTO marketing.list_members (audience_id, contact_id)
    SELECT ${A.in}::int, c.id FROM marketing.contacts c
    WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
    ON CONFLICT DO NOTHING`;
});

// ─── W-OUT · quem recebeu e não se inscreveu ───────────────────────────────
// "Recebeu alguma peça" e não só "está na base": quem nunca recebeu nada ainda
// não foi convidado, e mandar o E2 de conteúdo antes do convite inverteria a
// campanha. Descadastrado e audiência de teste ficam de fora.
// O driver do Neon não compõe fragmentos de sql`` aninhados (ao contrário do
// postgres.js): a condição é escrita por extenso e o filtro de WhatsApp entra
// como parâmetro booleano, não como pedaço de SQL.
const CONDICAO_OUT = async (audienceId, count, soComWhatsapp) => {
  if (count) {
    const r = await sql`
      SELECT count(*)::int AS n
      FROM marketing.contacts c
      WHERE c.status = 'active'
        AND NOT (COALESCE(c.attributes->'tags', '[]'::jsonb) ? ${TAG})
        AND EXISTS (
          SELECT 1 FROM marketing.sends s
          JOIN marketing.campaigns ca ON ca.id = s.campaign_id
          WHERE s.contact_id = c.id AND ca.project_id = ${proj.id}
        )
        AND NOT EXISTS (
          SELECT 1 FROM marketing.suppressions su
          WHERE su.identifier IN (c.email, c.whatsapp, c.phone)
        )
        AND c.id NOT IN (SELECT contact_id FROM marketing.list_members WHERE audience_id = ${A.teste})
        AND (${soComWhatsapp}::boolean = false OR c.whatsapp IS NOT NULL)`;
    return r[0].n;
  }
  await sql`
    INSERT INTO marketing.list_members (audience_id, contact_id)
    SELECT ${audienceId}::int, c.id
    FROM marketing.contacts c
    WHERE c.status = 'active'
      AND NOT (COALESCE(c.attributes->'tags', '[]'::jsonb) ? ${TAG})
      AND EXISTS (
        SELECT 1 FROM marketing.sends s
        JOIN marketing.campaigns ca ON ca.id = s.campaign_id
        WHERE s.contact_id = c.id AND ca.project_id = ${proj.id}
      )
      AND NOT EXISTS (
        SELECT 1 FROM marketing.suppressions su
        WHERE su.identifier IN (c.email, c.whatsapp, c.phone)
      )
      AND c.id NOT IN (SELECT contact_id FROM marketing.list_members WHERE audience_id = ${A.teste})
      AND (${soComWhatsapp}::boolean = false OR c.whatsapp IS NOT NULL)
    ON CONFLICT DO NOTHING`;
};

await refill(A.out, 'W-OUT · não inscritos', (c) => CONDICAO_OUT(A.out, c, false));
await refill(A.outWa, 'W-OUT · não inscritos c/ WhatsApp', (c) => CONDICAO_OUT(A.outWa, c, true));

// ─── Bifurcação presente / ausente ─────────────────────────────────────────
// Só faz sentido depois do evento, quando o CSV do relatório de presença do
// Meet tiver sido importado (é ele que grava attributes.webinar_presente).
await refill(A.presentes, 'Inscritos PRESENTES', async (count) => {
  if (count) {
    const r = await sql`
      SELECT count(*)::int AS n FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
        AND (c.attributes->>'webinar_presente')::boolean IS TRUE`;
    return r[0].n;
  }
  await sql`
    INSERT INTO marketing.list_members (audience_id, contact_id)
    SELECT ${A.presentes}::int, c.id FROM marketing.contacts c
    WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
      AND (c.attributes->>'webinar_presente')::boolean IS TRUE
    ON CONFLICT DO NOTHING`;
});

await refill(A.ausentes, 'Inscritos AUSENTES', async (count) => {
  if (count) {
    const r = await sql`
      SELECT count(*)::int AS n FROM marketing.contacts c
      WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
        AND COALESCE((c.attributes->>'webinar_presente')::boolean, false) = false`;
    return r[0].n;
  }
  await sql`
    INSERT INTO marketing.list_members (audience_id, contact_id)
    SELECT ${A.ausentes}::int, c.id FROM marketing.contacts c
    WHERE c.status = 'active' AND c.attributes->'tags' ? ${TAG}
      AND COALESCE((c.attributes->>'webinar_presente')::boolean, false) = false
    ON CONFLICT DO NOTHING`;
});

console.log(dryRun ? '\n--dry-run: nada foi gravado.' : '\nAudiências reconstruídas.');
