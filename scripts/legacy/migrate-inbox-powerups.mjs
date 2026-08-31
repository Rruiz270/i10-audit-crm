// Migration idempotente — F2.1 inbox power-ups.
//   - marketing.conversations: ADD COLUMN notes, tags
//   - marketing.canned_responses (nova tabela) + seed global (idempotente)
// Segura para DEV e PROD: só ALTER ... IF NOT EXISTS / CREATE ... IF NOT EXISTS
// e INSERT ... WHERE NOT EXISTS. Nunca DROP, nunca toca dados existentes.
//
// Uso:
//   DATABASE_URL="<dev-url>"  node scripts/migrate-inbox-powerups.mjs   # DEV
//   DATABASE_URL="<prod-url>" node scripts/migrate-inbox-powerups.mjs   # PROD
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

console.log('1/4 conversations: notes + tags…');
await sql`ALTER TABLE marketing.conversations ADD COLUMN IF NOT EXISTS notes text`;
await sql`ALTER TABLE marketing.conversations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'`;

console.log('2/4 canned_responses…');
await sql`CREATE TABLE IF NOT EXISTS marketing.canned_responses (
  id serial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'global',
  project_id integer REFERENCES marketing.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by text REFERENCES crm.users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now()
)`;

console.log('3/4 canned_responses index…');
await sql`CREATE INDEX IF NOT EXISTS mkt_canned_scope_project_idx ON marketing.canned_responses (scope, project_id)`;

console.log('4/4 seed respostas rápidas globais (idempotente)…');
const seeds = [
  {
    title: 'Saudação inicial',
    body: 'Olá! Aqui é do Instituto i10. Tudo bem? Como podemos ajudar o seu município hoje?',
  },
  {
    title: 'Pedir dados do município',
    body: 'Para avançarmos, poderia confirmar o nome do município, o estado (UF) e o cargo de quem fala? Assim direcionamos o melhor atendimento.',
  },
  {
    title: 'Enviar diagnóstico',
    body: 'Preparamos um diagnóstico inicial com o potencial de recursos do seu município. Posso te enviar o material agora?',
  },
  {
    title: 'Agendar reunião',
    body: 'Que tal marcarmos uma conversa rápida (15-20 min) para apresentar como o Instituto i10 pode apoiar a sua secretaria? Qual o melhor dia e horário para você?',
  },
  {
    title: 'Agradecer e encerrar',
    body: 'Obrigado pelo contato! Qualquer dúvida, estamos à disposição por aqui. Tenha um ótimo dia. — Instituto i10',
  },
];

for (const s of seeds) {
  await sql`
    INSERT INTO marketing.canned_responses (scope, project_id, title, body)
    SELECT 'global', NULL, ${s.title}, ${s.body}
    WHERE NOT EXISTS (
      SELECT 1 FROM marketing.canned_responses
      WHERE scope = 'global' AND project_id IS NULL AND title = ${s.title}
    )`;
}

// Verificação
const cols = await sql`SELECT column_name FROM information_schema.columns
  WHERE table_schema='marketing' AND table_name='conversations'
    AND column_name IN ('notes','tags') ORDER BY column_name`;
const cannedCount = await sql`SELECT count(*)::int AS n FROM marketing.canned_responses WHERE scope='global'`;
console.log('✅ colunas conversations:', cols.map((r) => r.column_name).join(', ') || '(faltando!)');
console.log('✅ canned_responses globais:', cannedCount[0].n);
