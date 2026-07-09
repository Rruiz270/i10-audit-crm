/**
 * funnel-oportunidades.mjs
 * -----------------------------------------------------------------------------
 * Reorganiza o funil no modelo "pool x oportunidades":
 *   1. Adiciona a coluna crm.opportunities.active_no (nº sequencial de lead ativo).
 *   2. Renomeia o estágio 'contato_inicial' (label) → "Oportunidades".
 *   3. Leads SEM dono que estão em 'contato_inicial' voltam para o pool 'novo'.
 *      (leads COM dono ficam em 'contato_inicial'/Oportunidades)
 *   4. Faz backfill do active_no nos leads COM dono (ordem de criação).
 *
 * NÃO distribui donos (isso é o passo de go-live, via lista de distribuição).
 * Dry-run por padrão; use --apply para efetivar.
 *
 *   node scripts/funnel-oportunidades.mjs            # prévia
 *   node scripts/funnel-oportunidades.mjs --apply    # efetiva
 * -----------------------------------------------------------------------------
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes('--apply');

console.log(`\n=== funnel-oportunidades · ${APPLY ? 'APPLY (gravando)' : 'DRY-RUN (prévia)'} ===\n`);

// 1) coluna active_no
console.log('1) coluna crm.opportunities.active_no');
if (APPLY) {
  await sql`ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS active_no integer`;
  console.log('   ok (ADD COLUMN IF NOT EXISTS)');
} else {
  console.log('   [dry] ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS active_no integer');
}

// 2) renomear label do estágio
console.log("\n2) label 'contato_inicial' → 'Oportunidades'");
if (APPLY) {
  await sql`UPDATE crm.pipeline_stages SET label='Oportunidades', updated_at=now() WHERE key='contato_inicial'`;
  console.log('   ok');
} else {
  console.log("   [dry] UPDATE crm.pipeline_stages SET label='Oportunidades' WHERE key='contato_inicial'");
}

// 3) leads SEM dono em contato_inicial → novo (pool)
const toPool = await sql`
  SELECT o.id, m.nome FROM crm.opportunities o
  LEFT JOIN fundeb.municipalities m ON m.id=o.municipality_id
  WHERE o.stage='contato_inicial' AND o.owner_id IS NULL ORDER BY o.id`;
console.log(`\n3) ${toPool.length} leads SEM dono em Oportunidades → voltam ao pool 'novo':`);
for (const r of toPool) console.log(`   #${r.id} ${r.nome ?? '(sem município)'}`);
if (APPLY && toPool.length) {
  await sql`UPDATE crm.opportunities
            SET stage='novo', stage_updated_at=now(), updated_at=now()
            WHERE stage='contato_inicial' AND owner_id IS NULL`;
}

// 4) backfill active_no nos leads COM dono (ordem de criação)
const owned = await sql`
  SELECT o.id, m.nome, o.stage FROM crm.opportunities o
  LEFT JOIN fundeb.municipalities m ON m.id=o.municipality_id
  WHERE o.owner_id IS NOT NULL ORDER BY o.created_at, o.id`;
console.log(`\n4) backfill active_no em ${owned.length} leads COM dono (ordem de criação):`);
let n = 0;
for (const r of owned) {
  n += 1;
  console.log(`   #${String(n).padStart(3, '0')} ← op#${r.id} ${r.nome ?? '?'} [${r.stage}]`);
}
if (APPLY && owned.length) {
  // Atribui 1..N por ordem de criação; preserva se já existir? Reatribui tudo
  // de forma determinística para ficar contíguo.
  await sql`
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
      FROM crm.opportunities WHERE owner_id IS NOT NULL
    )
    UPDATE crm.opportunities o SET active_no = r.rn
    FROM ranked r WHERE o.id = r.id`;
  console.log('   ok');
}

// resumo final
if (APPLY) {
  const dist = await sql`SELECT stage, count(*) FILTER (WHERE owner_id IS NULL) sem_dono, count(*) total FROM crm.opportunities GROUP BY stage ORDER BY 1`;
  console.log('\n── DISTRIBUIÇÃO FINAL ──');
  for (const d of dist) console.log(`   ${d.stage.padEnd(20)} total ${d.total}  (sem dono ${d.sem_dono})`);
  const [mx] = await sql`SELECT max(active_no) m FROM crm.opportunities`;
  console.log(`   maior active_no: ${mx.m ?? 0}`);
}
console.log(APPLY ? '\n✔ aplicado\n' : '\n(prévia — use --apply para efetivar)\n');
