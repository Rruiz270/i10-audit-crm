// Adiciona crm.opportunities.lead_entrada_at — a data de entrada do lead.
//
// Diferente de created_at: quando um novo contato da MESMA cidade engaja, não
// criamos outra oportunidade; anexamos o contato à existente e trazemos esta
// data para o momento mais recente. É por ela que as telas filtram.
//
//   node scripts/migrate-lead-entrada.mjs
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
let url = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
url = url.trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

await sql`ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS lead_entrada_at timestamp`;
console.log('✓ coluna lead_entrada_at');

// Backfill: quem já existe entra com a própria data de criação.
const back = await sql`
  UPDATE crm.opportunities SET lead_entrada_at = COALESCE(created_at, NOW())
  WHERE lead_entrada_at IS NULL RETURNING id`;
console.log(`✓ backfill em ${back.length} oportunidade(s)`);

await sql`ALTER TABLE crm.opportunities ALTER COLUMN lead_entrada_at SET DEFAULT NOW()`;
console.log('✓ default NOW()');

await sql`CREATE INDEX IF NOT EXISTS opportunities_lead_entrada_idx
  ON crm.opportunities (lead_entrada_at DESC)`;
console.log('✓ índice (filtro por período)');

// Índice que sustenta a busca "já existe lead desta cidade nesta campanha?"
await sql`CREATE INDEX IF NOT EXISTS opportunities_muni_source_idx
  ON crm.opportunities (municipality_id, source)`;
console.log('✓ índice (cidade × origem)');

const n = await sql`
  SELECT count(*)::int total,
         count(*) FILTER (WHERE lead_entrada_at IS NOT NULL)::int com_data
  FROM crm.opportunities`;
console.log(`pronto — ${n[0].com_data}/${n[0].total} com data de entrada.`);
