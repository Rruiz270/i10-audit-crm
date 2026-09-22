// Preenche os links que chegam depois dos templates: a sala do Meet, a
// gravação e o PDF do roteiro.
//
//   node scripts/webinar/set-links.mjs --sala "https://meet.google.com/abc-defg-hij"
//   node scripts/webinar/set-links.mjs --gravacao "https://..." --pdf "https://..."
//   node scripts/webinar/set-links.mjs            # mostra o que está gravado
//
// Vai para projects.settings.mergeExtras, que buildMergeVars() espalha por
// último. Nenhum template precisa ser re-renderizado: {{link_sala}} passa a
// resolver na próxima peça que sair.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const SLUG = 'webinar-impositivas';
const args = process.argv.slice(2);
const pega = (flag) => {
  const i = args.indexOf(`--${flag}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const [proj] = await sql`SELECT id, settings FROM marketing.projects WHERE slug = ${SLUG}`;
if (!proj) {
  console.error(`Projeto ${SLUG} não existe — rode o seed antes.`);
  process.exit(1);
}

const mapa = { sala: 'link_sala', gravacao: 'link_gravacao', pdf: 'link_pdf' };
const novos = {};
for (const [flag, chave] of Object.entries(mapa)) {
  const v = pega(flag);
  if (v !== undefined) novos[chave] = v.trim();
}

if (Object.keys(novos).length) {
  for (const [chave, v] of Object.entries(novos)) {
    if (v && !/^https?:\/\//i.test(v)) {
      console.error(`${chave}: "${v}" não parece uma URL — abortando para não gravar link quebrado numa peça.`);
      process.exit(1);
    }
  }
  await sql`
    UPDATE marketing.projects
    SET settings = jsonb_set(settings, '{mergeExtras}',
          COALESCE(settings->'mergeExtras', '{}'::jsonb) || ${JSON.stringify(novos)}::jsonb),
        updated_at = NOW()
    WHERE id = ${proj.id}`;
  console.log('gravado:', novos);
}

const [depois] = await sql`SELECT settings->'mergeExtras' AS e FROM marketing.projects WHERE id = ${proj.id}`;
console.log('\nmergeExtras agora:');
for (const [k, v] of Object.entries(depois.e ?? {})) {
  console.log(`  ${k.padEnd(15)} ${v || '(vazio)'}`);
}

const faltando = Object.entries(depois.e ?? {}).filter(([, v]) => !v).map(([k]) => k);
if (faltando.length) console.log(`\nainda vazio: ${faltando.join(', ')}`);
