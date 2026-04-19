import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const tables = await sql`SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'fundeb'
  ORDER BY table_name`;
console.log('=== fundeb tables ===');
for (const t of tables) console.log(' · ' + t.table_name);

// Dump columns for every table — we need to find report / document / action_plan hooks
for (const t of tables) {
  const cols = await sql`SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='fundeb' AND table_name=${t.table_name}
    ORDER BY ordinal_position`;
  console.log(`\n--- fundeb.${t.table_name} (${cols.length} cols) ---`);
  for (const c of cols) {
    console.log(`    ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
  }
}

// sample row counts to see what's populated
const counts = await sql`SELECT
  (SELECT count(*) FROM fundeb.consultorias) AS consultorias,
  (SELECT count(*) FROM fundeb.documents) AS documents,
  (SELECT count(*) FROM fundeb.action_plans) AS action_plans,
  (SELECT count(*) FROM fundeb.approvals) AS approvals,
  (SELECT count(*) FROM fundeb.compliance_items) AS compliance_items,
  (SELECT count(*) FROM fundeb.ec135_metas) AS ec135_metas`;
console.log('\n=== row counts ===');
console.log(counts[0]);
