import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

console.log('Criando crm.pipeline_stages (idempotente):');
await sql`CREATE TABLE IF NOT EXISTS crm.pipeline_stages (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  color text NOT NULL DEFAULT 'slate-500',
  "order" integer NOT NULL,
  probability real NOT NULL DEFAULT 0.5,
  rot_days integer,
  is_terminal boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
)`;
console.log('  ✓ table');

const defaults = [
  { key: 'novo', label: 'Novo', color: 'slate-500', order: 1, prob: 0.05, rot: 5 },
  { key: 'contato_inicial', label: 'Contato Inicial', color: 'blue-500', order: 2, prob: 0.15, rot: 7 },
  { key: 'diagnostico_enviado', label: 'Diagnóstico Enviado', color: 'indigo-500', order: 3, prob: 0.3, rot: 10 },
  { key: 'follow_up', label: 'Follow-up', color: 'violet-500', order: 4, prob: 0.4, rot: 14 },
  { key: 'reuniao_auditoria', label: 'Reunião de Auditoria', color: 'amber-500', order: 5, prob: 0.6, rot: 10 },
  { key: 'negociacao', label: 'Negociação', color: 'orange-500', order: 6, prob: 0.8, rot: 7 },
  { key: 'ganhou', label: 'Ganhou', color: 'emerald-500', order: 7, prob: 1.0, rot: null, terminal: true, won: true },
  { key: 'perdido', label: 'Perdido', color: 'rose-500', order: 99, prob: 0.0, rot: null, terminal: true, won: false },
];

for (const d of defaults) {
  await sql`INSERT INTO crm.pipeline_stages
    (key, label, color, "order", probability, rot_days, is_terminal, is_won, is_custom)
    VALUES (${d.key}, ${d.label}, ${d.color}, ${d.order}, ${d.prob}, ${d.rot ?? null},
            ${d.terminal ?? false}, ${d.won ?? false}, false)
    ON CONFLICT (key) DO NOTHING`;
}
console.log(`  ✓ seeded ${defaults.length} default stages`);

await sql`CREATE INDEX IF NOT EXISTS pipeline_stages_order_idx ON crm.pipeline_stages ("order")`;
console.log('  ✓ index');

console.log('\n✓ Migração de stages concluída.');
