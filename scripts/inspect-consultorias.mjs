import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const cols = await sql`SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='fundeb' AND table_name='consultorias'
  ORDER BY ordinal_position`;
console.log('--- fundeb.consultorias ---');
console.log(JSON.stringify(cols, null, 2));

const munCols = await sql`SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='fundeb' AND table_name='municipalities'
  ORDER BY ordinal_position`;
console.log('--- fundeb.municipalities ---');
console.log(JSON.stringify(munCols.slice(0, 15), null, 2));

const counts = await sql`SELECT
  (SELECT count(*) FROM fundeb.municipalities) AS municipalities,
  (SELECT count(*) FROM fundeb.consultorias) AS consultorias,
  (SELECT count(*) FROM crm.opportunities) AS opportunities,
  (SELECT count(*) FROM crm.lead_forms) AS lead_forms`;
console.log('--- row counts ---');
console.log(counts);
