// Envio de teste da campanha do webinar — só para destinatários internos.
//
//   node scripts/webinar/test-send.mjs --email voce@… [--peca E1]
//   node scripts/webinar/test-send.mjs --whatsapp +5511… --peca W1
//
// Cria uma audiência "ZZ Teste webinar" com o destinatário passado e uma
// campanha espelho da peça escolhida. Nunca toca nas campanhas reais nem na
// base das câmaras — o prefixo ZZ mantém tudo fora de contagem e trilha.
import { config } from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EMAILS, WA_TEMPLATES } from './emails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

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

// Deriva o nome do template das próprias copies — renomear uma peça em
// emails.mjs não quebra o teste.
const PECAS = Object.fromEntries([
  ...EMAILS.map((e) => [e.key, e.name]),
  ...WA_TEMPLATES.map((w) => [w.key, w.friendly]),
]);
if (!PECAS[peca]) {
  console.error(`Peça "${peca}" não existe. Disponíveis: ${Object.keys(PECAS).join(' ')}`);
  process.exit(1);
}

const [proj] = await sql`SELECT id, settings FROM marketing.projects WHERE slug = 'webinar-impositivas'`;
if (!proj) {
  console.error('Projeto webinar-impositivas não existe — rode o seed.');
  process.exit(1);
}

const testEmail = (email ?? `teste+${whatsapp.replace(/\D/g, '')}@institutoi10.com.br`).toLowerCase();
const attrs = {
  presidente: nome,
  primeiro_nome: nome.split(' ')[0],
  camara: `Câmara Municipal de ${municipio}`,
  funcao: 'Presidente da Câmara',
  tags: ['webinar:teste-interno'],
};
// O e-mail de teste pode já existir como contato REAL — o do Heitor existe
// desde junho. Um upsert cego sobrescreveria município e atributos de um
// registro de produção (foi o que aconteceu em 22/09 e teve de ser desfeito
// à mão). Então: se o contato já existe e não é de teste, usamos o registro
// como está e não escrevemos nada nele.
const [existente] = await sql`
  SELECT id, email, whatsapp, name, municipio, source, attributes
  FROM marketing.contacts WHERE email = ${testEmail} LIMIT 1`;

let contato;
if (existente && existente.source !== 'teste-interno') {
  contato = existente;
  console.log(`contato JÁ EXISTE ......... #${contato.id} ${contato.email} (source=${existente.source})`);
  console.log(`                            não foi alterado — as variáveis do teste vêm do que já está gravado.`);
} else {
  [contato] = await sql`
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
}

const AUD = 'ZZ Teste webinar (não usar em disparo real)';
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

const [tpl] = await sql`
  SELECT id, channel, wa_template_name FROM marketing.templates
  WHERE project_id = ${proj.id} AND name = ${PECAS[peca]} LIMIT 1`;
if (!tpl) {
  console.error(`Peça ${peca} não encontrada (${PECAS[peca]}).`);
  process.exit(1);
}
if (tpl.channel === 'whatsapp' && !tpl.wa_template_name) {
  console.error(`A peça ${peca} ainda não tem Content SID — rode submit-wa-templates.mjs`);
  process.exit(1);
}

const campNome = `ZZ TESTE ${peca} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const provider = tpl.channel === 'whatsapp' ? 'twilio' : 'brevo';
const [camp] = await sql`
  INSERT INTO marketing.campaigns
    (project_id, audience_id, template_id, name, status, provider, rate_per_minute, total_recipients)
  VALUES (${proj.id}, ${aud.id}, ${tpl.id}, ${campNome}, 'draft', ${provider}, 60, 0)
  RETURNING id`;
console.log(`campanha de teste ......... #${camp.id} ${campNome} · ${provider}`);

// Espelha buildMergeVars(), INCLUSIVE o mergeExtras do projeto — é o que
// carrega {{link_sala}}. Sem isso o teste passaria e a peça real sairia com
// o link vazio, que é exatamente o erro que queremos pegar aqui.
const settings = proj.settings ?? {};
const token = crypto.randomBytes(32).toString('base64url');
const q = `?t=${encodeURIComponent(token)}`;
// Contato reaproveitado traz os próprios dados; só o que faltar nele é
// completado com os argumentos, para a peça não sair com {{municipio}} vazio.
const attrsReais = { ...attrs, ...((contato.attributes ?? {})) };
const nomeReal = contato.name ?? nome;
const muniReal = contato.municipio ?? municipio;
const mergeVars = {
  ...attrsReais,
  presidente: attrsReais.presidente ?? nomeReal,
  primeiro_nome: attrsReais.primeiro_nome ?? String(nomeReal).split(' ')[0],
  camara: attrsReais.camara ?? `Câmara Municipal de ${muniReal}`,
  nome: nomeReal,
  municipio: muniReal,
  uf: 'SP',
  email: contato.email,
  link_lp: `${settings.lpBaseUrl}${q}`,
  link_whatsapp: `https://wa.me/${String(settings.waNumber).replace(/\D/g, '')}?text=${encodeURIComponent(
    `Olá! Sou ${nome} da Câmara de ${municipio} e tenho uma dúvida sobre o webinar de 29/09.`,
  )}`,
  ...(settings.mergeExtras ?? {}),
};

const vazias = Object.entries(settings.mergeExtras ?? {})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (vazias.length) console.log(`aviso ..................... mergeExtras vazio(s): ${vazias.join(', ')}`);

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
console.log(`\nA fila é drenada a cada 5 min. Para sair agora:`);
console.log(`  curl -H "Authorization: Bearer $CRON_SECRET" \\`);
console.log(`    "https://i10-audit-crm.vercel.app/api/marketing/cron/drain?limit=5"`);
