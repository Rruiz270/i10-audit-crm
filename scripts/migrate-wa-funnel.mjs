// Migration idempotente — funil WhatsApp completo (lido/respondido/convertido).
// Adiciona campaigns.read_count e campaigns.replied_count e faz backfill
// agregando marketing.events (wa_read/wa_replied, 1 por send). Segura para
// DEV e PROD: ADD COLUMN IF NOT EXISTS + UPDATE recalculável (re-rodar ok).
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-wa-funnel.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-wa-funnel.mjs   # PROD
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dotenv NÃO sobrescreve vars já setadas no shell — então DATABASE_URL passado
// na linha de comando vence o .env.local.
config({ path: path.join(__dirname, '..', '.env.local') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL ausente');
  process.exit(1);
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return '?';
  }
})();
console.log('→ aplicando em host:', host);

console.log('1/3 colunas read_count / replied_count…');
await sql`ALTER TABLE marketing.campaigns ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE marketing.campaigns ADD COLUMN IF NOT EXISTS replied_count integer NOT NULL DEFAULT 0`;

console.log('2/3 backfill read_count a partir de events (wa_read, distinct por send)…');
await sql`UPDATE marketing.campaigns c
  SET read_count = agg.n
  FROM (
    SELECT s.campaign_id, count(DISTINCT e.send_id)::int AS n
    FROM marketing.events e
    JOIN marketing.sends s ON s.id = e.send_id
    WHERE e.type = 'wa_read'
    GROUP BY s.campaign_id
  ) agg
  WHERE agg.campaign_id = c.id AND c.read_count <> agg.n`;

console.log('3/3 backfill replied_count a partir de events (wa_replied, distinct por send)…');
await sql`UPDATE marketing.campaigns c
  SET replied_count = agg.n
  FROM (
    SELECT s.campaign_id, count(DISTINCT e.send_id)::int AS n
    FROM marketing.events e
    JOIN marketing.sends s ON s.id = e.send_id
    WHERE e.type = 'wa_replied'
    GROUP BY s.campaign_id
  ) agg
  WHERE agg.campaign_id = c.id AND c.replied_count <> agg.n`;

// Verificação
const check = await sql`SELECT
    count(*)::int AS campanhas,
    coalesce(sum(read_count), 0)::int AS lidos,
    coalesce(sum(replied_count), 0)::int AS respondidos
  FROM marketing.campaigns`;
console.log(
  `✅ ${check[0].campanhas} campanhas · lidos=${check[0].lidos} · respondidos=${check[0].respondidos}`,
);
