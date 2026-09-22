// Cria os templates de WhatsApp do webinar na Twilio Content API e os submete
// à aprovação da Meta. Grava o Content SID (HX…) no template do CRM — sem ele
// o disparo frio é recusado fora da janela de 24h.
//
//   node scripts/webinar/submit-wa-templates.mjs           # cria/submete
//   node scripts/webinar/submit-wa-templates.mjs --status  # só consulta
//
// Duas diferenças em relação ao script da Impositivas SP:
//   · o convite usa `twilio/call-to-action` com BOTÃO DE URL, não quick-reply.
//     É o que faz o clique ser contabilizado — os dois disparos anteriores
//     marcaram 0 cliques justamente por terem o link solto no corpo.
//   · o lembrete de sala vai como UTILITY (é evento para quem se inscreveu),
//     que aprova mais rápido e não pesa no teto de marketing da Meta.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WA_TEMPLATES } from './emails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
if (!SID || !TOKEN) {
  console.error('Faltam TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');
const statusOnly = process.argv.includes('--status');
const SLUG = 'webinar-impositivas';

async function approvalStatus(contentSid) {
  const r = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
    headers: { Authorization: auth },
  });
  const j = await r.json();
  return j?.whatsapp?.status ?? j?.status ?? 'desconhecido';
}

for (const w of WA_TEMPLATES) {
  const rows = await sql`
    SELECT t.id, t.wa_template_name FROM marketing.templates t
    JOIN marketing.projects p ON p.id = t.project_id
    WHERE p.slug = ${SLUG} AND t.name = ${w.friendly} LIMIT 1`;
  if (!rows.length) {
    console.error(`template "${w.friendly}" não existe no CRM — rode o seed antes.`);
    continue;
  }
  const tpl = rows[0];

  if (tpl.wa_template_name) {
    const st = await approvalStatus(tpl.wa_template_name);
    // Recusado pela Meta: o SID antigo é inútil, então recriamos com a copy
    // corrigida em vez de deixar a peça travada.
    if (st !== 'rejected' || statusOnly) {
      console.log(`${w.name.padEnd(28)} já criado (${tpl.wa_template_name}) → ${st}`);
      continue;
    }
    console.log(`${w.name.padEnd(28)} recusado antes — recriando com a copy nova`);
    await sql`UPDATE marketing.templates SET wa_template_name = NULL WHERE id = ${tpl.id}`;
  }
  if (statusOnly) {
    console.log(`${w.name.padEnd(28)} ainda não submetido`);
    continue;
  }

  // O tipo depende de haver botão de URL. `twilio/text` vai sempre junto como
  // alternativa — é o que a Twilio usa se o canal não suportar o rich type.
  const types = { 'twilio/text': { body: w.body } };
  if (w.urlButton) {
    types['twilio/call-to-action'] = {
      body: w.body,
      actions: [{ type: 'URL', title: w.urlButton.title, url: w.urlButton.url }],
    };
  }

  const createRes = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      friendly_name: w.name,
      language: 'pt_BR',
      variables: Object.fromEntries(w.variables.map((v, i) => [String(i + 1), v])),
      types,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error(`${w.name}: falha ao criar →`, created?.message ?? created);
    continue;
  }
  const contentSid = created.sid;

  const apprRes = await fetch(
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: w.name, category: w.category }),
    },
  );
  const appr = await apprRes.json();

  await sql`
    UPDATE marketing.templates
    SET wa_template_name = ${contentSid}, wa_template_language = 'pt_BR',
        status = 'active', updated_at = NOW()
    WHERE id = ${tpl.id}`;

  console.log(
    `${w.name.padEnd(28)} ${w.category.padEnd(9)} ${contentSid} → ${
      apprRes.ok ? appr?.status ?? 'submetido' : 'ERRO: ' + (appr?.message ?? JSON.stringify(appr))
    }`,
  );
}

console.log('\nAprovação da Meta costuma levar de 1h a 48h.');
console.log('Reconsultar: node scripts/webinar/submit-wa-templates.mjs --status');
