// Idempotent migration for the Pipedrive-inspired upgrade pass.
// Touches crm.* only. Safe to re-run — every DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function step(label, stmt) {
  process.stdout.write(`  → ${label}… `);
  await stmt;
  console.log('ok');
}

console.log('Migrando crm.* (idempotente):');

await step(
  'crm.opportunities.tags (text[])',
  sql`ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[]`,
);

await step(
  'crm.opportunities.lost_reason_code (text)',
  sql`ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS lost_reason_code text`,
);

await step(
  'crm.opportunities.last_activity_at (timestamp)',
  sql`ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS last_activity_at timestamp DEFAULT NOW()`,
);

// Seed last_activity_at from created_at for existing rows where NULL
await step(
  'backfill last_activity_at on existing rows',
  sql`UPDATE crm.opportunities SET last_activity_at = COALESCE(updated_at, created_at, NOW()) WHERE last_activity_at IS NULL`,
);

await step(
  'crm.tasks table',
  sql`CREATE TABLE IF NOT EXISTS crm.tasks (
    id serial PRIMARY KEY,
    opportunity_id integer NOT NULL REFERENCES crm.opportunities(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    due_at timestamp NOT NULL,
    completed_at timestamp,
    assigned_to text REFERENCES crm.users(id),
    created_by text REFERENCES crm.users(id),
    priority text NOT NULL DEFAULT 'normal',
    created_at timestamp DEFAULT NOW()
  )`,
);

await step(
  'index tasks(due_at) for overdue queries',
  sql`CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON crm.tasks (due_at)`,
);

await step(
  'index tasks(assigned_to) for "my tasks"',
  sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON crm.tasks (assigned_to)`,
);

await step(
  'index opportunities(last_activity_at) for rotten queries',
  sql`CREATE INDEX IF NOT EXISTS opps_last_activity_idx ON crm.opportunities (last_activity_at)`,
);

console.log('\n✓ Migração concluída.');
