// Seed de DEMONSTRAÇÃO do app /atende — cria conversas fictícias para testar o
// fluxo (meus atendimentos, fila, chat, transferir, resolver, nota, ficha) SEM
// depender de inbound real do WhatsApp.
//
// Tudo é claramente marcado: conversas com tag ['demo'] e contatos com
// source='demo:atende', telefones FICTÍCIOS (+55 15 9XXXX-00NN) que NÃO existem
// no WhatsApp — nenhum envio real acontece a partir deles.
//
//   node scripts/seed-atende-demo.mjs --yes     # cria
//   node scripts/seed-atende-demo.mjs --clean   # remove só os demo
//
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL ausente (.env.local). Rode `vercel env pull .env.local`.');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const mode = process.argv.includes('--clean') ? 'clean' : process.argv.includes('--yes') ? 'seed' : 'help';

if (mode === 'help') {
  console.log('Uso:\n  node scripts/seed-atende-demo.mjs --yes     (cria conversas demo)\n  node scripts/seed-atende-demo.mjs --clean   (remove as conversas demo)');
  process.exit(0);
}

async function clean() {
  // Conversas demo (tag 'demo') → messages caem por ON DELETE CASCADE.
  const del = await sql`DELETE FROM marketing.conversations WHERE 'demo' = ANY(tags) RETURNING id`;
  await sql`DELETE FROM marketing.contacts WHERE source = 'demo:atende'`;
  console.log(`🧹 Removidas ${del.length} conversas demo (+ contatos demo).`);
}

if (mode === 'clean') {
  await clean();
  process.exit(0);
}

// ── SEED ──
await clean(); // idempotente: limpa demo anterior antes

// Usuário "dono" das conversas atribuídas. Preferimos a conta de teste
// admin@i10.crm (login por senha em qualquer porta) → depois ADMIN_EMAILS → 1º user.
let owner = null;
const candidates = ['admin@i10.crm', (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim()].filter(Boolean);
for (const email of candidates) {
  const r = await sql`SELECT id, name FROM crm.users WHERE lower(email) = lower(${email}) LIMIT 1`;
  if (r[0]) { owner = r[0]; break; }
}
if (!owner) {
  const r = await sql`SELECT id, name FROM crm.users ORDER BY created_at NULLS LAST LIMIT 1`;
  owner = r[0] ?? null;
}
if (!owner) {
  console.error('✗ Nenhum usuário em crm.users — faça login uma vez antes de semear.');
  process.exit(1);
}

// Projeto para os chips (pega um existente; senão null).
const proj = (await sql`SELECT id, name FROM marketing.projects ORDER BY id LIMIT 1`)[0] ?? null;
const projectId = proj?.id ?? null;

// Contatos/conversas demo. window: horas restantes na janela de 24h (null=fora).
const DEMO = [
  { name: 'Marcos Antônio',   muni: 'Sorocaba',            uf: 'SP', mine: true,  win: 21, unread: true,  status: 'open',
    msgs: [['out','Olá Marcos, aqui é do Instituto i10. Posso te enviar o material do FUNDEB 2026?'],['in','Opa, pode sim! Temos interesse.'],['in','Qual o valor estimado do FUNDEB pra cá?']] },
  { name: 'Renata Fonseca',   muni: 'Iperó',               uf: 'SP', mine: true,  win: 4,  unread: false, status: 'open',
    msgs: [['in','Bom dia! Vocês têm proposta por escrito?'],['out','Bom dia, Renata! Segue o material da Conexão APM 👍']] },
  { name: 'João Carlos',      muni: 'Salto de Pirapora',   uf: 'SP', mine: true,  win: null, unread: false, status: 'pending',
    msgs: [['out','Bom dia, doutor! Podemos marcar 15 min esta semana?']] },
  { name: 'Luciana Prado',    muni: 'Piedade',             uf: 'SP', mine: false, win: 24, unread: true,  status: 'open',
    msgs: [['in','Oi! Vi o estande de vocês no evento, queria saber mais.']] },
  { name: 'Eduardo Alves',    muni: 'Araçoiaba da Serra',  uf: 'SP', mine: false, win: 23, unread: true,  status: 'open',
    msgs: [['in','Bom dia, como funciona o multiplicador 1,50 do FUNDEB?']] },
  { name: 'Márcia Souza',     muni: 'Boituva',             uf: 'SP', mine: false, win: 6,  unread: true,  status: 'open',
    msgs: [['in','Gostaria de receber a proposta por escrito, por favor.']] },
];

let n = 0;
for (const d of DEMO) {
  n++;
  const phone = `+55159${String(1000 + n).padStart(4, '0')}00${n}`; // fictício
  const [contact] = await sql`
    INSERT INTO marketing.contacts (email, phone, whatsapp, name, municipio, uf, source, status)
    VALUES (${`demo${n}@atende.local`}, ${phone}, ${phone}, ${d.name}, ${d.muni}, ${d.uf}, 'demo:atende', 'active')
    RETURNING id`;

  const winExpr = d.win == null ? null : new Date(Date.now() + d.win * 3600_000).toISOString();
  const lastInbound = winExpr ? new Date().toISOString() : null;
  const [conv] = await sql`
    INSERT INTO marketing.conversations
      (channel, wa_phone, contact_name, contact_id, project_id, status, assigned_to,
       window_expires_at, last_message_at, last_inbound_at, unread, tags)
    VALUES ('whatsapp', ${phone}, ${d.name}, ${contact.id}, ${projectId}, ${d.status},
       ${d.mine ? owner.id : null}, ${winExpr}, now(), ${lastInbound},
       ${d.unread}, ARRAY['demo'])
    RETURNING id`;

  let t = Date.now() - d.msgs.length * 3600_000;
  for (const [dir, body] of d.msgs) {
    t += 1800_000;
    await sql`
      INSERT INTO marketing.messages (conversation_id, direction, author_user_id, body, status, created_at)
      VALUES (${conv.id}, ${dir}, ${dir === 'outbound' ? owner.id : null}, ${body},
              ${dir === 'outbound' ? 'delivered' : null}, ${new Date(t).toISOString()})`;
  }
}

const mine = DEMO.filter((d) => d.mine).length;
console.log(`✅ Semeadas ${DEMO.length} conversas demo (${mine} suas, ${DEMO.length - mine} na fila).`);
console.log(`   Dono das atribuídas: ${owner.name ?? owner.id}${proj ? ` · projeto: ${proj.name}` : ''}`);
console.log('   Abra http://localhost:3001/atende  ·  limpe depois com --clean');
