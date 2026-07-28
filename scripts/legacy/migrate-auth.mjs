import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

console.log('Migração auth (idempotente):');

await sql`ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS password_hash text`;
console.log('  ✓ users.password_hash');

// approval_status separado de is_active permite distinguir:
//   · rejected = admin negou
//   · pending  = aguardando
//   · approved = aprovado
// is_active fica para "ativo/desativado" (ex: ex-consultor)
await sql`ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'`;
console.log('  ✓ users.approval_status (default approved — backwards-compatible com users existentes)');

// ALTER no tipo do NOT NULL default dá defeito para linhas antigas, mas PG aplica o default só pra novas.
// Para segurança, garantimos que usuários já existentes ficam approved:
await sql`UPDATE crm.users SET approval_status = 'approved' WHERE approval_status IS NULL`;
console.log('  ✓ backfill approval_status');

await sql`CREATE INDEX IF NOT EXISTS users_approval_status_idx ON crm.users (approval_status)`;
console.log('  ✓ index');

console.log('\n✓ Migração auth concluída.');
