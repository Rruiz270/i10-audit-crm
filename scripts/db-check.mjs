import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const tables = await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('crm','fundeb') ORDER BY table_schema, table_name`;
console.log(JSON.stringify(tables, null, 2));
