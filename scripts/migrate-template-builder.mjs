// Migration idempotente — Template Builder (WhatsApp via Twilio Content API).
//   - marketing.templates: ADD COLUMN category, wa_buttons (jsonb)
//   - marketing.templates: project_id passa a ser NULLABLE (templates WA
//     standalone não pertencem a 1 projeto). NUNCA dropa, só relaxa o NOT NULL.
// `variables` já existe como text[] (lista de nomes); aqui reaproveitamos para
// guardar os nomes/posições das variáveis {{1}}..{{n}}.
//
// Segura para DEV e PROD: só ALTER ... IF NOT EXISTS / DROP NOT NULL.
// Nunca DROP TABLE/COLUMN, nunca toca dados existentes.
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-template-builder.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-template-builder.mjs   # PROD
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

console.log('1/3 templates: category + wa_buttons…');
await sql`ALTER TABLE marketing.templates ADD COLUMN IF NOT EXISTS category text`;
await sql`ALTER TABLE marketing.templates ADD COLUMN IF NOT EXISTS wa_buttons jsonb DEFAULT '[]'::jsonb`;

console.log('2/3 templates: project_id → NULLABLE…');
// DROP NOT NULL é idempotente (no-op se já é nullable).
await sql`ALTER TABLE marketing.templates ALTER COLUMN project_id DROP NOT NULL`;

console.log('3/3 verificação…');
const cols = await sql`SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_schema='marketing' AND table_name='templates'
    AND column_name IN ('category','wa_buttons','project_id') ORDER BY column_name`;
console.log('✅ colunas:', cols.map((r) => `${r.column_name}(nullable=${r.is_nullable})`).join(', ') || '(faltando!)');
