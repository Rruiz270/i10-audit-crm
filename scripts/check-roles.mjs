import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const u = await sql`SELECT id, email, name, role, is_active FROM crm.users ORDER BY created_at`;
console.log(JSON.stringify(u, null, 2));

// também checa sessions ativas (útil pra saber se precisa re-login)
const s = await sql`SELECT session_token, user_id, expires FROM crm.sessions ORDER BY expires DESC LIMIT 5`;
console.log('\n--- sessões ativas ---');
console.log(JSON.stringify(s, null, 2));
