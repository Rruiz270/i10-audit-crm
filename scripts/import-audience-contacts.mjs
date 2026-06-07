// Importa audience.contacts (base do i10-insights, ~16k) → marketing.contacts.
// Idempotente: ON CONFLICT (email) DO NOTHING → re-rodar só traz novos.
// INSERT...SELECT no próprio banco (1 query) — eficiente pra 16k, sem round-trips.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const before = await sql`select count(*)::int n from marketing.contacts`;
console.log('marketing.contacts ANTES:', before[0].n);

// DISTINCT ON (email) pra evitar duplicata dentro do lote; mais recente vence.
const res = await sql`
  INSERT INTO marketing.contacts (email, phone, name, role, municipio, uf, source, attributes, lgpd_basis, status, created_at, updated_at)
  SELECT DISTINCT ON (email)
    email,
    phone,
    name,
    role,
    municipio,
    uf,
    coalesce(nullif(source, ''), 'insights') AS source,
    coalesce(attributes, '{}'::jsonb),
    CASE WHEN consent THEN 'consent' ELSE 'legitimate_interest' END,
    'active',
    coalesce(created_at, now()),
    now()
  FROM audience.contacts
  WHERE email IS NOT NULL AND email <> ''
  ORDER BY email, updated_at DESC NULLS LAST
  ON CONFLICT (email) DO NOTHING
`;

const after = await sql`select count(*)::int n from marketing.contacts`;
console.log('marketing.contacts DEPOIS:', after[0].n, '(+' + (after[0].n - before[0].n) + ' novos)');

console.log('\nDistribuição de fontes (top 12):');
for (const r of await sql`select coalesce(source,'(sem)') s, count(*)::int n from marketing.contacts group by source order by n desc limit 12`)
  console.log('  ', r.s, '→', r.n);

console.log('\nPor UF (top 12):');
for (const r of await sql`select coalesce(uf,'(sem)') uf, count(*)::int n from marketing.contacts group by uf order by n desc limit 12`)
  console.log('  ', r.uf, '→', r.n);
