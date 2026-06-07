// Migration idempotente — adiciona marketing.contacts.source + índices de
// filtro/contagem para o Leads Hub (escala 16k+ contatos) e faz backfill.
// Segura para DEV e PROD: só ADD COLUMN/CREATE INDEX ... IF NOT EXISTS e
// UPDATE escopado a `source IS NULL`. NUNCA dropa nada.
//
// Uso:
//   DATABASE_URL="$DATABASE_URL_DEV" node scripts/migrate-contact-source.mjs   # DEV
//   DATABASE_URL="<prod-url>"        node scripts/migrate-contact-source.mjs   # PROD
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

console.log('1/4 ADD COLUMN source…');
await sql`ALTER TABLE marketing.contacts ADD COLUMN IF NOT EXISTS source text`;

console.log('2/4 índices de filtro/contagem (source, uf, role, status)…');
await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_source_idx ON marketing.contacts (source)`;
await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_uf_idx ON marketing.contacts (uf)`;
await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_role_idx ON marketing.contacts (role)`;
// mkt_contacts_status_idx já existe (declarado no schema desde F1), mas o IF NOT
// EXISTS torna a re-aplicação inofensiva caso o ambiente não o tenha.
await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_status_idx ON marketing.contacts (status)`;

console.log('3/4 índices ILIKE-friendly (trigram em name/email)…');
// pg_trgm acelera o ILIKE '%q%' da busca livre a 16k+. Best-effort: se a
// extensão não puder ser criada (permissões), seguimos sem ela — o ILIKE ainda
// funciona, só sem índice.
try {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_name_trgm_idx ON marketing.contacts USING gin (lower(name) gin_trgm_ops)`;
  await sql`CREATE INDEX IF NOT EXISTS mkt_contacts_email_trgm_idx ON marketing.contacts USING gin (lower(email) gin_trgm_ops)`;
  console.log('   pg_trgm ok');
} catch (err) {
  console.warn('   pg_trgm indisponível, seguindo sem índice trigram:', err.message);
}

console.log('4/4 backfill source (apenas onde NULL)…');
// Para contatos sem source: derivar de uma audiência a que pertencem
// (csv:<nome da audiência>), preferindo a audiência mais antiga. Caso não
// estejam em nenhuma audiência → 'manual'. Escopado a source IS NULL = idempotente.
const backfill = await sql`
  WITH first_aud AS (
    SELECT DISTINCT ON (lm.contact_id)
      lm.contact_id,
      a.name AS audience_name
    FROM marketing.list_members lm
    JOIN marketing.audiences a ON a.id = lm.audience_id
    ORDER BY lm.contact_id, a.created_at ASC, a.id ASC
  )
  UPDATE marketing.contacts c
  SET source = COALESCE('csv:' || fa.audience_name, 'manual')
  FROM (SELECT id FROM marketing.contacts WHERE source IS NULL) tgt
  LEFT JOIN first_aud fa ON fa.contact_id = tgt.id
  WHERE c.id = tgt.id AND c.source IS NULL
  RETURNING c.id`;
console.log(`   backfill aplicado em ${backfill.length} contato(s)`);

// Verificação
const [{ total }] = await sql`SELECT count(*)::int AS total FROM marketing.contacts`;
const [{ nullsrc }] = await sql`SELECT count(*)::int AS nullsrc FROM marketing.contacts WHERE source IS NULL`;
const dist = await sql`
  SELECT source, count(*)::int AS n
  FROM marketing.contacts
  GROUP BY source ORDER BY n DESC LIMIT 10`;
console.log(`✅ contacts total=${total} · source NULL restantes=${nullsrc}`);
console.log('   distribuição de fontes (top 10):');
for (const r of dist) console.log(`     ${r.source ?? '(null)'} → ${r.n}`);
