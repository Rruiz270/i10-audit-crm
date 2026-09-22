// Arma (ou desarma) o calendário do Webinar Impositivas.
//
// Enquanto as campanhas estão em `draft`, nada dispara. Ao armar, elas passam
// a `scheduled` e o cron lança cada uma na data marcada. Este é o único passo
// que coloca a campanha no ar — de propósito.
//
//   node scripts/webinar/arm.mjs                # mostra o calendário
//   node scripts/webinar/arm.mjs --arm          # arma TODAS as datas
//   node scripts/webinar/arm.mjs --arm E1       # arma só uma peça
//   node scripts/webinar/arm.mjs --disarm       # volta tudo para draft
//   node scripts/webinar/arm.mjs --arm --force  # ignora os avisos do pré-voo
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const alvo = args.find((a) => !a.startsWith('--')) ?? null;
const SLUG = 'webinar-impositivas';

const [proj] = await sql`SELECT id, settings FROM marketing.projects WHERE slug = ${SLUG}`;
if (!proj) {
  console.error(`Projeto ${SLUG} não existe — rode o seed antes.`);
  process.exit(1);
}

const pad = (n) => String(n).padStart(2, '0');
// scheduled_at é `timestamp` sem fuso e guarda UTC; o driver o devolve como
// Date local, então formatamos os componentes locais para não somar 3h.
const fmt = (d) =>
  d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}Z` : '—';

async function linhas() {
  return sql`
    SELECT c.id, c.name, c.status, c.scheduled_at, c.sent_count,
           a.contact_count, a.name AS audiencia, t.channel, t.wa_template_name
    FROM marketing.campaigns c
    JOIN marketing.audiences a ON a.id = c.audience_id
    JOIN marketing.templates t ON t.id = c.template_id
    WHERE c.project_id = ${proj.id} AND c.name NOT LIKE '[seq:%' AND c.name NOT LIKE 'ZZ %'
    ORDER BY c.scheduled_at NULLS LAST`;
}

async function mostrar() {
  const rows = await linhas();
  console.log('\n peça                                         quando        status     público  canal');
  console.log(' ' + '-'.repeat(92));
  for (const r of rows) {
    const canal =
      r.channel === 'whatsapp' ? (r.wa_template_name ? 'WA · SID ok' : 'WA · SEM SID') : 'e-mail';
    console.log(
      ` ${r.name.slice(0, 44).padEnd(44)} ${fmt(r.scheduled_at ? new Date(r.scheduled_at) : null).padEnd(13)} ${String(r.status).padEnd(10)} ${String(r.contact_count ?? 0).padStart(5)}  ${canal}`,
    );
  }
  console.log('');
}

// ─── Pré-voo ───────────────────────────────────────────────────────────────
// As três coisas que, pelo histórico desta base, estragam um disparo: template
// de WhatsApp sem SID aprovado, link da sala vazio numa peça que o promete, e
// descadastro forjável porque o segredo do HMAC está em branco.
// `filtro` limita o pré-voo às peças que estão sendo armadas: armar só o E1
// de hoje não deveria ser barrado por um template de WhatsApp que a Meta
// aprova amanhã.
async function preVoo(filtro = null) {
  const avisos = [];
  const todas = await linhas();
  const rows = filtro ? todas.filter((r) => r.name.startsWith(`${filtro} `)) : todas;
  if (filtro && !rows.length) {
    return [`nenhuma peça corresponde a "${filtro}".`];
  }

  const semSid = rows.filter((r) => r.channel === 'whatsapp' && !r.wa_template_name);
  if (semSid.length) {
    avisos.push(
      `${semSid.length} peça(s) de WhatsApp sem Content SID: ${semSid.map((r) => r.name.split(' ·')[0]).join(', ')}.\n` +
        '    → node scripts/webinar/submit-wa-templates.mjs',
    );
  }

  // Ter SID não é ter aprovação: o SID é gravado na SUBMISSÃO. Armar uma peça
  // ainda `pending` marca uma data em que o disparo vai falhar em massa — por
  // isso perguntamos o status real à Twilio, uma vez por SID.
  const comSid = rows.filter((r) => r.channel === 'whatsapp' && r.wa_template_name);
  const sids = [...new Set(comSid.map((r) => r.wa_template_name))];
  if (sids.length && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const auth =
      'Basic ' +
      Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const status = {};
    await Promise.all(
      sids.map(async (sid) => {
        try {
          const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
            headers: { Authorization: auth },
          });
          const j = await r.json();
          status[sid] = j?.whatsapp?.status ?? j?.status ?? 'desconhecido';
        } catch {
          status[sid] = 'erro ao consultar';
        }
      }),
    );
    const naoAprovadas = comSid.filter((r) => status[r.wa_template_name] !== 'approved');
    if (naoAprovadas.length) {
      avisos.push(
        `${naoAprovadas.length} peça(s) de WhatsApp com template NÃO aprovado pela Meta:\n` +
          naoAprovadas
            .map((r) => `      ${r.name.split(' ·')[0].padEnd(5)} ${status[r.wa_template_name]}`)
            .join('\n') +
          '\n    → o SID existe desde a submissão; só "approved" dispara sem ser recusado.',
      );
    }
  }

  const extras = proj.settings.mergeExtras ?? {};
  if (!extras.link_sala) {
    const dependem = rows.filter((r) => /Véspera|Dia do evento|Confirma/i.test(r.name));
    avisos.push(
      `link_sala está VAZIO em projects.settings.mergeExtras — ${dependem.length} peça(s) mandam o link da sala.\n` +
        '    → atualize com: node scripts/webinar/set-links.mjs --sala "https://meet.google.com/xxx-xxxx-xxx"',
    );
  }

  if (!(process.env.MARKETING_UNSUB_SECRET ?? '').trim()) {
    avisos.push(
      'MARKETING_UNSUB_SECRET está vazio: o link de descadastro é assinado com chave vazia\n' +
        '    e pode ser forjado por terceiros. Definir em produção antes do primeiro disparo.',
    );
  }

  const vazias = rows.filter((r) => (r.contact_count ?? 0) === 0 && r.status === 'draft');
  if (vazias.length) {
    avisos.push(
      `${vazias.length} peça(s) com audiência vazia hoje (normal para as trilhas dinâmicas —\n` +
        '    o cron as reconstrói antes de cada data): ' +
        vazias.map((r) => r.name.split(' ·')[0]).join(', '),
    );
  }
  return avisos;
}

if (has('disarm')) {
  const r = await sql`
    UPDATE marketing.campaigns SET status = 'draft', updated_at = NOW()
    WHERE project_id = ${proj.id} AND status = 'scheduled' RETURNING name`;
  console.log(`desarmadas: ${r.length}`);
  await mostrar();
} else if (has('arm')) {
  const avisos = await preVoo(alvo);
  if (avisos.length) {
    console.log('\n⚠  PRÉ-VOO:');
    avisos.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
    if (!has('force')) {
      console.log('\nNada foi armado. Resolva os pontos acima ou repita com --force.');
      await mostrar();
      process.exit(1);
    }
    console.log('\n--force: armando mesmo assim.');
  }
  const filtro = alvo ? `${alvo} %` : '%';
  const r = await sql`
    UPDATE marketing.campaigns SET status = 'scheduled', updated_at = NOW()
    WHERE project_id = ${proj.id} AND status = 'draft'
      AND name NOT LIKE 'ZZ %' AND name LIKE ${filtro}
    RETURNING name, scheduled_at`;
  if (!r.length) console.log('nada para armar (já armadas ou filtro sem correspondência).');
  r.forEach((x) => console.log(`armada: ${x.name} → ${fmt(new Date(x.scheduled_at))}`));
  await mostrar();
  console.log('A partir de agora o cron lança cada peça na data. Para reverter: --disarm');
} else {
  await mostrar();
  const avisos = await preVoo(alvo);
  if (avisos.length) {
    console.log('⚠  pendências antes de armar:');
    avisos.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
    console.log('');
  }
  console.log('Use --arm para colocar no ar, --disarm para voltar tudo a draft.');
}
