// Migration idempotente — colunas de moderação em marketing.messages.
// edited_at: marcado quando um admin edita o corpo da mensagem no CRM.
// deleted_at: soft-delete (esconde do thread, preserva auditoria/twilio_sid).
// Segura para DEV e PROD: só ADD COLUMN IF NOT EXISTS, nunca dropa nada.
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-message-moderation.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-message-moderation.mjs   # PROD
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dotenv NÃO sobrescreve vars já setadas no shell — DATABASE_URL da linha de
// comando vence o .env.local.
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

console.log('1/2 messages.edited_at…');
await sql`ALTER TABLE marketing.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz`;

console.log('2/2 messages.deleted_at…');
await sql`ALTER TABLE marketing.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;

console.log('✓ moderação de mensagens aplicada.');
