import { config } from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
config({ path: path.join(__dirname, '..', '.env') });

// Marca as migrations committadas como JÁ APLICADAS num banco existente,
// sem executar o SQL. Necessário uma única vez por banco criado na era
// do `db:push` — a partir daí, `npm run db:migrate` aplica só o que for novo.
//
// Uso:
//   node scripts/db-baseline.mjs            → journal do crm (DATABASE_URL)
//   node scripts/db-baseline.mjs marketing  → journal do marketing (DATABASE_URL_DEV)
//
// Replica exatamente o formato do migrator do drizzle-orm/drizzle-kit:
// tabela drizzle.<journal> (id serial, hash text, created_at bigint), onde
// hash = sha256 do arquivo .sql inteiro e created_at = "when" do _journal.json.

const target = process.argv[2] === 'marketing' ? 'marketing' : 'crm';

const FOLDERS = {
  crm: {
    dir: path.join(__dirname, '..', 'drizzle'),
    table: '__drizzle_migrations_crm',
    envVar: 'DATABASE_URL',
  },
  marketing: {
    dir: path.join(__dirname, '..', 'drizzle', 'marketing'),
    table: '__drizzle_migrations_marketing',
    envVar: 'DATABASE_URL_DEV',
  },
};

const { dir, table, envVar } = FOLDERS[target];
const url = process.env[envVar];
if (!url) {
  console.error(`✗ ${envVar} não está setada (necessária para o baseline de "${target}").`);
  process.exit(1);
}

const journalPath = path.join(dir, 'meta', '_journal.json');
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);

await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql.query(`CREATE TABLE IF NOT EXISTS drizzle."${table}" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
)`);

const existing = await sql.query(`SELECT hash FROM drizzle."${table}"`);
const known = new Set(existing.map((r) => r.hash));

let inserted = 0;
for (const entry of journal.entries) {
  const file = path.join(dir, `${entry.tag}.sql`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file).toString()).digest('hex');
  if (known.has(hash)) {
    console.log(`  · ${entry.tag} já registrada`);
    continue;
  }
  await sql.query(`INSERT INTO drizzle."${table}" (hash, created_at) VALUES ($1, $2)`, [
    hash,
    entry.when,
  ]);
  console.log(`  ✓ ${entry.tag} marcada como aplicada`);
  inserted++;
}

console.log(`\n✓ Baseline de "${target}" concluído (${inserted} registradas, ${known.size} já existiam).`);
