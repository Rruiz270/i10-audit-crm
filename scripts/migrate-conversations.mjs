// Migration idempotente — tabelas marketing.conversations + marketing.messages (F2).
// Segura para DEV e PROD: só CREATE ... IF NOT EXISTS, nunca toca tabelas existentes.
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-conversations.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-conversations.mjs   # PROD
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

console.log('1/7 conversations…');
await sql`CREATE TABLE IF NOT EXISTS marketing.conversations (
  id serial PRIMARY KEY,
  channel text NOT NULL DEFAULT 'whatsapp',
  wa_phone text NOT NULL,
  contact_name text,
  contact_id integer REFERENCES marketing.contacts(id) ON DELETE SET NULL,
  crm_contact_id integer,
  project_id integer REFERENCES marketing.projects(id) ON DELETE SET NULL,
  opportunity_id integer,
  campaign_id integer REFERENCES marketing.campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  assigned_to text REFERENCES crm.users(id) ON DELETE SET NULL,
  window_expires_at timestamp,
  last_message_at timestamp DEFAULT now(),
  last_inbound_at timestamp,
  unread boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  closed_at timestamp
)`;

console.log('2/7 conversations indexes…');
await sql`CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_phone_uniq ON marketing.conversations (channel, wa_phone)`;
await sql`CREATE INDEX IF NOT EXISTS conversations_project_idx ON marketing.conversations (project_id)`;
await sql`CREATE INDEX IF NOT EXISTS conversations_status_idx ON marketing.conversations (status)`;
await sql`CREATE INDEX IF NOT EXISTS conversations_assigned_idx ON marketing.conversations (assigned_to)`;

console.log('6/7 messages…');
await sql`CREATE TABLE IF NOT EXISTS marketing.messages (
  id serial PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES marketing.conversations(id) ON DELETE CASCADE,
  twilio_sid text,
  direction text NOT NULL,
  author_user_id text REFERENCES crm.users(id) ON DELETE SET NULL,
  body text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  template_sid text,
  status text,
  created_at timestamp DEFAULT now()
)`;

console.log('7/7 messages index…');
await sql`CREATE INDEX IF NOT EXISTS messages_conversation_idx ON marketing.messages (conversation_id, created_at)`;

// Verificação
const check = await sql`SELECT table_name FROM information_schema.tables
  WHERE table_schema='marketing' AND table_name IN ('conversations','messages') ORDER BY table_name`;
console.log('✅ tabelas presentes:', check.map((r) => r.table_name).join(', '));
