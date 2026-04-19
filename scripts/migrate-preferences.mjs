import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

console.log('Criando crm.user_preferences (idempotente):');

await sql`CREATE TABLE IF NOT EXISTS crm.user_preferences (
  user_id text PRIMARY KEY REFERENCES crm.users(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  notify_task_overdue boolean NOT NULL DEFAULT true,
  notify_new_lead boolean NOT NULL DEFAULT true,
  notify_handoff_kickoff boolean NOT NULL DEFAULT true,
  notify_bncc_signals boolean NOT NULL DEFAULT true,
  default_pipeline_filter text NOT NULL DEFAULT 'all',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  working_hours_start time,
  working_hours_end time,
  display_compact boolean NOT NULL DEFAULT false,
  updated_at timestamp DEFAULT NOW()
)`;
console.log('  ✓ table');

// Também adicionar colunas na users pra full_name / phone / signature (override do Google)
await sql`ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS display_name text`;
await sql`ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS phone text`;
await sql`ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS signature text`;
console.log('  ✓ users.display_name / phone / signature');

console.log('\n✓ Migração de preferences concluída.');
