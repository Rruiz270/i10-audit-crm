// Arma (ou desarma) o calendário da campanha Impositivas SP.
//
// Enquanto as campanhas estão em `draft`, nada dispara. Ao armar, elas passam
// a `scheduled` e o cron do GitHub Actions lança cada uma na data marcada.
// Este é o único passo que coloca a campanha no ar — de propósito.
//
//   node scripts/impositivas/arm.mjs --status     # o que está armado
//   node scripts/impositivas/arm.mjs --arm        # arma TODAS as datas
//   node scripts/impositivas/arm.mjs --arm E1     # arma só uma peça
//   node scripts/impositivas/arm.mjs --disarm     # volta tudo para draft
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const alvo = args.find((a) => !a.startsWith('--')) ?? null;

const [proj] = await sql`SELECT id FROM marketing.projects WHERE slug = 'impositivas-sp'`;
if (!proj) {
  console.error('Projeto impositivas-sp não existe.');
  process.exit(1);
}

async function mostrar() {
  const rows = await sql`
    SELECT c.id, c.name, c.status, c.scheduled_at, c.total_recipients, c.sent_count,
           a.contact_count, t.channel, t.wa_template_name
    FROM marketing.campaigns c
    JOIN marketing.audiences a ON a.id = c.audience_id
    JOIN marketing.templates t ON t.id = c.template_id
    WHERE c.project_id = ${proj.id} AND c.name NOT LIKE '[seq:%' AND c.name NOT LIKE 'ZZ TESTE%'
    ORDER BY c.scheduled_at NULLS LAST`;
  console.log('\n peça                                       quando        status      público  canal');
  console.log(' ' + '-'.repeat(88));
  for (const r of rows) {
    // scheduled_at é `timestamp` sem fuso e guarda UTC; o driver o devolve
    // como Date local, então formatamos os componentes UTC para não somar 3h.
    const d = r.scheduled_at ? new Date(r.scheduled_at) : null;
    const pad = (n) => String(n).padStart(2, '0');
    const quando = d
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}Z`
      : '—';
    const canal = r.channel === 'whatsapp' ? (r.wa_template_name ? 'WA · SID ok' : 'WA · sem SID') : 'e-mail';
    console.log(
      ` ${r.name.slice(0, 42).padEnd(42)} ${quando.padEnd(13)} ${String(r.status).padEnd(11)} ${String(r.contact_count).padStart(5)}  ${canal}`,
    );
  }
  console.log('');
}

if (has('disarm')) {
  const r = await sql`
    UPDATE marketing.campaigns SET status = 'draft', updated_at = NOW()
    WHERE project_id = ${proj.id} AND status = 'scheduled' RETURNING name`;
  console.log(`desarmadas: ${r.length}`);
  await mostrar();
} else if (has('arm')) {
  const filtro = alvo ? `${alvo} %` : '%';
  const r = await sql`
    UPDATE marketing.campaigns SET status = 'scheduled', updated_at = NOW()
    WHERE project_id = ${proj.id} AND status = 'draft'
      AND name NOT LIKE 'ZZ TESTE%' AND name LIKE ${filtro}
    RETURNING name, scheduled_at`;
  if (!r.length) console.log('nada para armar (já armadas ou filtro sem correspondência).');
  r.forEach((x) => console.log(`armada: ${x.name} → ${new Date(x.scheduled_at).toISOString().slice(0, 16)}`));
  await mostrar();
  console.log('A partir de agora o cron lança cada peça na data. Para reverter: --disarm');
} else {
  await mostrar();
  console.log('Use --arm para colocar no ar, --disarm para voltar tudo a draft.');
}
