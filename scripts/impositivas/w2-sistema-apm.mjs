// W2 · Sistema de gestão (APM) — peça de WhatsApp para a base inteira de
// celulares das Câmaras SP (audiência "Câmaras SP — WhatsApp", 390 contatos).
//
// Faz as três etapas, cada uma idempotente:
//   --submit    cria/atualiza o template no CRM, cria o Content na Twilio e
//               submete à aprovação da Meta
//   --status    consulta o status da aprovação
//   --campanha  cria a campanha (draft) apontando para a audiência 9
//   --lancar    lança a campanha (só roda com o template aprovado)
//   --teste +55...  lança só para um número (usa --lancar com limite 1)
//
// Env: usa scripts/impositivas/prod.env ou PROD_ENV_FILE (TWILIO_* + DATABASE_URL).
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const PROJECT_ID = 7;
const AUDIENCE_ID = 9; // Câmaras SP — WhatsApp
const CRM_NAME = 'W2 · Sistema de gestão (APM)';
const META_NAME = 'impositivas_sistema_gestao_apm';

// A Meta recusa template que comece ou termine com variável — por isso o "Olá,".
const BODY =
  'Olá, {{1}}!\n\n' +
  'O Instituto i10, em conjunto com a Associação Paulista de Municípios, ' +
  'desenvolveu um sistema para a gestão das emendas impositivas. ' +
  'O prazo para adequação é até 30/09/2026.\n\n' +
  'Podemos auxiliá-lo nesta adequação?';

const BUTTONS = [
  { id: 'adequar', title: 'Precisamos nos adequar' },
  { id: 'falar', title: 'Falar com especialista' },
];

// {{1}} = primeiro nome do contato. Sem nome, o motor manda "Presidente".
const VARIABLES = ['primeiro_nome'];

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');

async function upsertTemplate() {
  const [existing] = await sql`
    SELECT id, wa_template_name FROM marketing.templates
    WHERE project_id = ${PROJECT_ID} AND name = ${CRM_NAME} LIMIT 1`;
  if (existing) {
    await sql`
      UPDATE marketing.templates
      SET text = ${BODY}, variables = ${VARIABLES}, category = 'MARKETING',
          wa_buttons = ${JSON.stringify(BUTTONS)}::jsonb, updated_at = NOW()
      WHERE id = ${existing.id}`;
    return existing;
  }
  const [row] = await sql`
    INSERT INTO marketing.templates
      (project_id, channel, name, text, variables, status, category, wa_template_language, wa_buttons)
    VALUES (${PROJECT_ID}, 'whatsapp', ${CRM_NAME}, ${BODY}, ${VARIABLES}, 'active', 'MARKETING',
            'pt_BR', ${JSON.stringify(BUTTONS)}::jsonb)
    RETURNING id, wa_template_name`;
  return row;
}

async function approvalStatus(contentSid) {
  const r = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
    headers: { Authorization: auth },
  });
  const j = await r.json();
  return j?.whatsapp ?? j;
}

async function submit() {
  const tpl = await upsertTemplate();
  if (tpl.wa_template_name) {
    const st = await approvalStatus(tpl.wa_template_name);
    console.log(`já existe ${tpl.wa_template_name} → ${st?.status ?? JSON.stringify(st)}`);
    if (st?.status !== 'rejected') return;
    console.log('recusado antes — recriando');
  }

  const createRes = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      friendly_name: META_NAME,
      language: 'pt_BR',
      variables: { 1: 'primeiro_nome' },
      types: {
        'twilio/quick-reply': {
          body: BODY,
          actions: BUTTONS.map((b) => ({ id: b.id, title: b.title })),
        },
        'twilio/text': { body: BODY },
      },
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error('falha ao criar o Content →', created?.message ?? created);
    process.exit(1);
  }

  const apprRes = await fetch(
    `https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/whatsapp`,
    {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: META_NAME, category: 'MARKETING' }),
    },
  );
  const appr = await apprRes.json();
  await sql`
    UPDATE marketing.templates
    SET wa_template_name = ${created.sid}, wa_template_language = 'pt_BR',
        status = 'active', updated_at = NOW()
    WHERE id = ${tpl.id}`;
  console.log(`criado ${created.sid} → ${apprRes.ok ? appr?.status ?? 'submetido' : 'ERRO: ' + JSON.stringify(appr)}`);
}

async function status() {
  const [tpl] = await sql`
    SELECT id, wa_template_name FROM marketing.templates
    WHERE project_id = ${PROJECT_ID} AND name = ${CRM_NAME} LIMIT 1`;
  if (!tpl?.wa_template_name) return console.log('ainda não submetido');
  const st = await approvalStatus(tpl.wa_template_name);
  console.log(tpl.wa_template_name, '→', JSON.stringify(st));
}

async function campanha() {
  const [tpl] = await sql`
    SELECT id, wa_template_name FROM marketing.templates
    WHERE project_id = ${PROJECT_ID} AND name = ${CRM_NAME} LIMIT 1`;
  if (!tpl) return console.log('rode --submit antes');
  const nome = 'W2 · Sistema de gestão das impositivas (APM)';
  const [existing] = await sql`
    SELECT id, status FROM marketing.campaigns WHERE project_id = ${PROJECT_ID} AND name = ${nome} LIMIT 1`;
  if (existing) return console.log(`campanha ${existing.id} já existe (${existing.status})`);
  const [row] = await sql`
    INSERT INTO marketing.campaigns
      (project_id, audience_id, template_id, name, status, provider, rate_per_minute)
    VALUES (${PROJECT_ID}, ${AUDIENCE_ID}, ${tpl.id}, ${nome}, 'draft', 'twilio', 30)
    RETURNING id`;
  console.log(`campanha ${row.id} criada em draft (audiência ${AUDIENCE_ID})`);
}

// Agenda a campanha para AGORA e cutuca o cron da campanha (que roda a cada
// 15 min) para não esperar a próxima janela. O launch em si é do motor —
// quota da Meta, supressão e ritmo por minuto continuam valendo.
async function lancar() {
  const [tpl] = await sql`
    SELECT id, wa_template_name FROM marketing.templates
    WHERE project_id = ${PROJECT_ID} AND name = ${CRM_NAME} LIMIT 1`;
  const st = await approvalStatus(tpl.wa_template_name);
  if (st?.status !== 'approved') {
    console.log(`template ainda não aprovado (${st?.status}) — nada foi disparado`);
    process.exit(2);
  }

  // Sem primeiro nome o motor mandaria "Olá, !" — a saudação vira "Presidente".
  const semNome = await sql`
    UPDATE marketing.contacts c
       SET attributes = coalesce(c.attributes, '{}'::jsonb) || '{"primeiro_nome":"Presidente"}'::jsonb
     WHERE c.id IN (SELECT contact_id FROM marketing.list_members WHERE audience_id = ${AUDIENCE_ID})
       AND coalesce(btrim(c.attributes->>'primeiro_nome'), '') = ''
    RETURNING c.id`;
  if (semNome.length) console.log(`${semNome.length} contato(s) sem nome → "Presidente"`);

  const nome = 'W2 · Sistema de gestão das impositivas (APM)';
  const [camp] = await sql`
    UPDATE marketing.campaigns SET status = 'scheduled', scheduled_at = NOW(), updated_at = NOW()
     WHERE project_id = ${PROJECT_ID} AND name = ${nome} AND status = 'draft'
    RETURNING id`;
  if (!camp) {
    console.log('campanha não está em draft (já lançada?) — nada feito');
    process.exit(3);
  }
  console.log(`campanha ${camp.id} agendada para agora`);

  const base = process.env.MARKETING_BASE_URL ?? 'https://i10-audit-crm.vercel.app';
  const r = await fetch(`${base}/api/marketing/cron/impositivas`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const j = await r.json().catch(() => null);
  console.log('cron →', JSON.stringify(j?.lancadas ?? j));
}

const arg = process.argv[2] ?? '--status';
if (arg === '--submit') await submit();
else if (arg === '--campanha') await campanha();
else if (arg === '--lancar') await lancar();
else await status();
