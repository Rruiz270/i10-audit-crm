// Migration idempotente — tabela marketing.user_projects (F3 — fila por projeto).
// Segura para DEV e PROD: só CREATE ... IF NOT EXISTS, nunca toca tabelas existentes.
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-user-projects.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-user-projects.mjs   # PROD
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

console.log('1/3 user_projects…');
await sql`CREATE TABLE IF NOT EXISTS marketing.user_projects (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES crm.users(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES marketing.projects(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now()
)`;

console.log('2/3 unique index…');
await sql`CREATE UNIQUE INDEX IF NOT EXISTS mkt_user_projects_unique ON marketing.user_projects (user_id, project_id)`;

console.log('3/3 lookup indexes…');
await sql`CREATE INDEX IF NOT EXISTS mkt_user_projects_user_idx ON marketing.user_projects (user_id)`;
await sql`CREATE INDEX IF NOT EXISTS mkt_user_projects_project_idx ON marketing.user_projects (project_id)`;

// Verificação
const check = await sql`SELECT table_name FROM information_schema.tables
  WHERE table_schema='marketing' AND table_name='user_projects'`;
console.log('✅ tabela presente:', check.map((r) => r.table_name).join(', ') || '(nenhuma!)');
