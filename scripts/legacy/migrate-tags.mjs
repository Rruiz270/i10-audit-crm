import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');

// DEV-safe: prefira DATABASE_URL explícito do ambiente (ex.:
//   DATABASE_URL=$DATABASE_URL_DEV node scripts/migrate-tags.mjs)
// Caso contrário, cai no DATABASE_URL_DEV do .env.local pra evitar tocar prod.
let url = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV;
if (!url) {
  console.error('Defina DATABASE_URL (ou DATABASE_URL_DEV).');
  process.exit(1);
}
// Tira aspas acidentais que possam ter vindo do shell.
url = url.trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

console.log('Criando crm.tags (idempotente):');
await sql`CREATE TABLE IF NOT EXISTS crm.tags (
  id serial PRIMARY KEY,
  label text NOT NULL,
  slug text,
  category text NOT NULL DEFAULT 'outro',
  color text NOT NULL DEFAULT 'slate',
  is_active boolean NOT NULL DEFAULT true,
  is_custom boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT NOW()
)`;
console.log('  ✓ table');

await sql`CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_uniq ON crm.tags (slug)`;
console.log('  ✓ unique index (slug)');

// Taxonomia padrão (is_custom=false). Seed idempotente: só insere se o slug
// ainda não existe — assim re-rodar nunca duplica nem sobrescreve edições.
const seed = [
  { label: 'Manual FUNDEB', category: 'origem', color: 'slate' },
  { label: 'APM FUNDEB', category: 'origem', color: 'violet' },
  { label: 'Formulário FUNDEB', category: 'origem', color: 'cyan' },
  { label: 'Webinar FUNDEB', category: 'origem', color: 'amber' },
  { label: 'Paraíba FUNDEB', category: 'origem', color: 'emerald' },
  { label: 'FUNDEB', category: 'produto', color: 'navy' },
  { label: 'Radar', category: 'produto', color: 'cyan' },
  { label: 'Integral', category: 'produto', color: 'emerald' },
  { label: 'Município Bilíngue', category: 'produto', color: 'indigo' },
];

function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

let inserted = 0;
for (const t of seed) {
  const slug = slugify(t.label);
  const res = await sql`
    INSERT INTO crm.tags (label, slug, category, color, is_custom, is_active)
    SELECT ${t.label}, ${slug}, ${t.category}, ${t.color}, false, true
    WHERE NOT EXISTS (SELECT 1 FROM crm.tags WHERE slug = ${slug})
    RETURNING id`;
  if (res.length) inserted += 1;
}
console.log(`  ✓ seeded ${inserted}/${seed.length} taxonomia tags (idempotente)`);

console.log('\n✓ Migração de tags concluída.');
