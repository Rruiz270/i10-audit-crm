// Envio de teste da campanha — só para destinatários internos.
//
//   node scripts/impositivas/test-send.mjs --email raphael@… [--peca E1]
//   node scripts/impositivas/test-send.mjs --whatsapp +5511… [--peca W1]
//
// Cria (uma vez) uma audiência "Teste interno" com os destinatários passados
// e uma campanha espelho da peça escolhida, apontando para essa audiência.
// Nunca toca nas campanhas reais nem na base de 645 câmaras.
import { config } from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const email = arg('email');
const whatsapp = arg('whatsapp');
const peca = arg('peca', email ? 'E1' : 'W1');
const nome = arg('nome', 'Raphael Ruiz');
const municipio = arg('municipio', 'São Paulo');

if (!email && !whatsapp) {
  console.error('Passe --email e/ou --whatsapp.');
  process.exit(1);
}

const PECAS = {
  E1: 'E1 · Abertura (TCE aponta impropriedades)',
  E2: 'E2 · Aula aberta 20 min',
  E3: 'E3 · Três instâncias + autodiagnóstico',
  A1: 'Trilha A · A1 — convite à sessão de 30 min',
  A2: 'Trilha A · A2 — checklist em 1 página',
  B1: 'B1 · Duas perguntas diretas (frios)',
  B2: 'B2 · Emendas que ficam na mesa (frios)',
  B4: 'B4 · Encerramento do ciclo (frios)',
  W1: 'W1 · WhatsApp abertura',
  B3: 'B3 · WhatsApp urgência (frios)',
};

const [proj] = await sql`SELECT id, settings FROM marketing.projects WHERE slug = 'impositivas-sp'`;
if (!proj) {
  console.error('Projeto impositivas-sp não existe — rode o seed.');
  process.exit(1);
}

// Contato de teste (marcado para nunca entrar nas audiências reais)
const testEmail = (email ?? `teste+${whatsapp.replace(/\D/g, '')}@institutoi10.com.br`).toLowerCase();
const attrs = {
  presidente: nome,
  primeiro_nome: nome.split(' ')[0],
  camara: `Câmara Municipal de ${municipio}`,
  tags: ['impositivas-sp:teste-interno'],
};
const [contato] = await sql`
  INSERT INTO marketing.contacts
    (email, phone, whatsapp, name, municipio, uf, role, source, attributes, lgpd_basis, status)
  VALUES (${testEmail}, ${whatsapp}, ${whatsapp}, ${nome}, ${municipio}, 'SP',
          'teste_interno', 'teste-interno', ${JSON.stringify(attrs)}::jsonb, 'consent', 'active')
  ON CONFLICT (email) DO UPDATE SET
    whatsapp = COALESCE(EXCLUDED.whatsapp, marketing.contacts.whatsapp),
    phone    = COALESCE(EXCLUDED.phone, marketing.contacts.phone),
    name = EXCLUDED.name, municipio = EXCLUDED.municipio,
    attributes = marketing.contacts.attributes || EXCLUDED.attributes,
    status = 'active', updated_at = NOW()
  RETURNING id, email, whatsapp`;
console.log(`contato de teste .......... #${contato.id} ${contato.email} ${contato.whatsapp ?? ''}`);

// Audiência exclusiva de teste
const AUD = 'ZZ Teste interno (não usar em disparo real)';
let [aud] = await sql`
  SELECT id FROM marketing.audiences WHERE project_id = ${proj.id} AND name = ${AUD} LIMIT 1`;
if (!aud) {
  [aud] = await sql`
    INSERT INTO marketing.audiences (project_id, name, description, source, source_meta)
    VALUES (${proj.id}, ${AUD}, 'Destinatários internos para validar renderização e entrega.',
            'manual', '{}'::jsonb) RETURNING id`;
}
await sql`
  INSERT INTO marketing.list_members (audience_id, contact_id)
  VALUES (${aud.id}, ${contato.id}) ON CONFLICT DO NOTHING`;
await sql`
  UPDATE marketing.audiences SET contact_count =
    (SELECT count(*) FROM marketing.list_members WHERE audience_id = ${aud.id}) WHERE id = ${aud.id}`;

// Template da peça
const [tpl] = await sql`
  SELECT id, channel, wa_template_name, variables FROM marketing.templates
  WHERE project_id = ${proj.id} AND name = ${PECAS[peca]} LIMIT 1`;
if (!tpl) {
  console.error(`Peça ${peca} não encontrada (${PECAS[peca]}).`);
  process.exit(1);
}
if (tpl.channel === 'whatsapp' && !tpl.wa_template_name) {
  console.error(`A peça ${peca} ainda não tem Content SID aprovado — rode submit-wa-templates.mjs`);
  process.exit(1);
}

// Campanha espelho, recriada a cada teste
const campNome = `ZZ TESTE ${peca} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const provider = tpl.channel === 'whatsapp' ? 'twilio' : 'brevo';
const [camp] = await sql`
  INSERT INTO marketing.campaigns
    (project_id, audience_id, template_id, name, status, provider, rate_per_minute, total_recipients)
  VALUES (${proj.id}, ${aud.id}, ${tpl.id}, ${campNome}, 'draft', ${provider}, 60, 0)
  RETURNING id`;
console.log(`campanha de teste ......... #${camp.id} ${campNome} · ${provider}`);

// Send + job — mesmo caminho do disparo real (buildMergeVars equivalente)
const settings = proj.settings ?? {};
const token = crypto.randomBytes(32).toString('base64url');
const q = `?t=${encodeURIComponent(token)}`;
const mergeVars = {
  ...attrs,
  nome,
  municipio,
  uf: 'SP',
  email: contato.email,
  link_lp: `${settings.lpBaseUrl}${q}`,
  link_aula: `${settings.lpBaseUrl}/aula${q}`,
  link_apresentacao: `${settings.lpBaseUrl}/apresentacao${q}`,
  link_whatsapp: `https://wa.me/${String(settings.waNumber).replace(/\D/g, '')}?text=${encodeURIComponent(
    `Olá! Sou ${nome} da Câmara de ${municipio} e quero saber sobre as emendas impositivas.`,
  )}`,
};

const [send] = await sql`
  INSERT INTO marketing.sends
    (campaign_id, contact_id, to_email, to_phone, merge_vars, status, tracking_token)
  VALUES (${camp.id}, ${contato.id},
          ${tpl.channel === 'whatsapp' ? null : contato.email},
          ${tpl.channel === 'whatsapp' ? contato.whatsapp : null},
          ${JSON.stringify(mergeVars)}::jsonb, 'queued', ${token})
  RETURNING id`;
await sql`
  INSERT INTO marketing.queue_jobs (type, payload, status, run_at, rate_bucket)
  VALUES (${tpl.channel === 'whatsapp' ? 'send_whatsapp' : 'send_email'},
          ${JSON.stringify({ sendId: send.id })}::jsonb, 'pending', NOW(), ${provider})`;
await sql`
  UPDATE marketing.campaigns SET status = 'sending', started_at = NOW(), total_recipients = 1
  WHERE id = ${camp.id}`;

console.log(`send ...................... #${send.id} enfileirado (${tpl.channel})`);
console.log(`\nO GitHub Actions drena a fila a cada 5 min. Para sair agora:`);
console.log(`  curl -H "Authorization: Bearer $CRON_SECRET" \\`);
console.log(`    "https://i10-audit-crm.vercel.app/api/marketing/cron/drain?limit=5"`);
