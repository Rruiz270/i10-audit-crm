// Cria marketing.lp_events — interações que acontecem NA landing page
// (visita, download de material, clique no WhatsApp). Não cabem em
// marketing.events porque lá send_id é NOT NULL e a LP é acessada também por
// quem não veio de um disparo.
//
//   DATABASE_URL=... node scripts/impositivas/migrate.mjs
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
let url = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
url = url.trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

await sql`CREATE TABLE IF NOT EXISTS marketing.lp_events (
  id serial PRIMARY KEY,
  project_id integer REFERENCES marketing.projects(id) ON DELETE CASCADE,
  contact_id integer REFERENCES marketing.contacts(id) ON DELETE SET NULL,
  send_id integer REFERENCES marketing.sends(id) ON DELETE SET NULL,
  type text NOT NULL,
  material text,
  path text,
  tracking_token text,
  ibge varchar(7),
  municipio text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  ip text,
  created_at timestamp NOT NULL DEFAULT NOW()
)`;
console.log('✓ marketing.lp_events');

for (const [name, col] of [
  ['mkt_lp_events_project_idx', 'project_id'],
  ['mkt_lp_events_contact_idx', 'contact_id'],
  ['mkt_lp_events_type_idx', 'type'],
  ['mkt_lp_events_created_idx', 'created_at'],
]) {
  await sql.query(`CREATE INDEX IF NOT EXISTS ${name} ON marketing.lp_events (${col})`);
  console.log(`  ✓ index ${col}`);
}

// Anti-flood: no máximo 1 evento do mesmo tipo/material por contato a cada
// pageview repetido é resolvido na rota; aqui só garantimos consulta rápida.
await sql`CREATE INDEX IF NOT EXISTS mkt_lp_events_dedupe_idx
  ON marketing.lp_events (project_id, contact_id, type, material)`;
console.log('  ✓ index dedupe');

const n = await sql`SELECT count(*)::int AS n FROM marketing.lp_events`;
console.log(`pronto — ${n[0].n} evento(s) na tabela.`);
