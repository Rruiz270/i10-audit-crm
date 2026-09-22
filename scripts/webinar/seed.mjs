// Semeia a campanha do Webinar de Emendas Impositivas (29/09/2026) no CRM.
// Idempotente: pode rodar de novo depois de editar as copies em emails.mjs.
//
//   node scripts/webinar/seed.mjs
//
// NÃO dispara nada. As campanhas nascem em `draft` com scheduled_at definido;
// quem as arma é scripts/webinar/arm.mjs (status → scheduled), e só então o
// cron passa a lançá-las na data.
//
// Zero contato novo: a base é a mesma da campanha Impositivas SP (957 e-mails,
// 390 celulares de 645 municípios de SP), já limpa e com IBGE. O webinar só
// cria audiências novas sobre os mesmos contatos.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMAILS, WA_TEMPLATES, renderEmail } from './emails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
config({ path: process.env.PROD_ENV_FILE ?? path.join(__dirname, 'prod.env') });

const { neon } = await import('@neondatabase/serverless');
let url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
url = url.trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

const SLUG = 'webinar-impositivas';
const LP = 'https://www.institutoi10.com.br/webinar-impositivas';
const WA_NUMBER = '5511947223906';
const SLUG_ORIGEM = 'impositivas-sp'; // de onde vem a base

// Calendário. Horário de Brasília = UTC-3 → 12:00Z = 09h BRT.
// O evento é terça 29/09; a campanha abre na terça 22/09, uma semana antes.
// O convite sai no mesmo dia em que a campanha é montada: sete dias de
// antecedência é o mínimo para a Câmara conseguir pautar quem vai assistir.
const CAL = {
  E1: '2026-09-22T17:00:00Z', // TER 14h · convite à base (sem os VIP)
  E0: '2026-09-22T18:00:00Z', // TER 15h · convite VIP (já levantou a mão)
  W1: '2026-09-23T13:00:00Z', // qua 10h · WhatsApp convite  ← depende da Meta
  E2: '2026-09-24T12:00:00Z', // qui 09h · conteúdo, só não inscritos
  W2: '2026-09-25T13:00:00Z', // sex 10h · último chamado, só não inscritos
  E3: '2026-09-28T12:00:00Z', // seg 09h · véspera, só inscritos
  W3: '2026-09-28T19:00:00Z', // seg 16h · véspera, só inscritos
  E4: '2026-09-29T11:00:00Z', // TER 08h · dia
  W4: '2026-09-29T11:15:00Z', // TER 08h15 · dia
  E5: '2026-09-29T17:00:00Z', // TER 14h · presentes
  W5: '2026-09-29T17:10:00Z', // TER 14h10 · presentes
  W5b: '2026-09-29T17:20:00Z', // TER 14h20 · inscritos ausentes
  E6: '2026-09-30T12:00:00Z', // qua 09h · inscritos ausentes
  E7: '2026-09-30T13:00:00Z', // qua 10h · não inscritos
  W6: '2026-10-02T18:00:00Z', // sex 15h · encerramento
};

// ─── 1. Projeto ────────────────────────────────────────────────────────────
const settings = {
  provider: 'brevo',
  // Decisão do Raphael (22/09): o e-mail sai pelo contato institucional.
  // A copy continua assinada pelo Heitor, com o telefone dele — o replyTo é
  // que precisa ser visto por mais de uma pessoa.
  fromEmail: 'i10@i10.org.br',
  fromName: 'Heitor Caldeira · Instituto i10',
  replyTo: 'i10@i10.org.br',
  lpBaseUrl: LP,
  waNumber: WA_NUMBER,
  signupTag: 'webinar:inscrito',
  // mergeExtras (link da sala, gravação, PDF) NÃO entra aqui de propósito:
  // `settings || EXCLUDED.settings` substitui a chave inteira, então repetir
  // os defaults vazios apagaria o link do Meet a cada re-seed. Os valores são
  // semeados logo abaixo, só quando faltam.
  evento: {
    data: '2026-09-29',
    inicio: '09:00',
    fim: '10:00',
    abreSala: '08:45',
    timezone: 'America/Sao_Paulo',
  },
  createOpportunity: true,
  opportunitySource: `lp_${SLUG}`,
  opportunityNotes: 'Inscreveu-se no webinar de emendas impositivas de 29/09 (LP /webinar-impositivas).',
  opportunitySubject: 'Inscreveu-se no webinar de emendas impositivas',
  opportunityOrigin: 'LP /webinar-impositivas',
  opportunityProducts: ['Emendas Impositivas'],
  audienciaIn: 'Webinar — Inscritos (W-IN)',
  audienciaOut: 'Webinar — Não inscritos (W-OUT)',
};

const projRows = await sql`
  INSERT INTO marketing.projects (name, slug, description, status, settings)
  VALUES ('Webinar Impositivas — 29/09/2026', ${SLUG},
          'Webinar gratuito para Câmaras Municipais de SP sobre gestão das emendas parlamentares impositivas. Duas trilhas: inscrito e não inscrito.',
          'active', ${JSON.stringify(settings)}::jsonb)
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = 'active',
        settings = marketing.projects.settings || EXCLUDED.settings,
        updated_at = NOW()
  RETURNING id`;
const projectId = projRows[0].id;
console.log(`projeto ................... #${projectId} (${SLUG})`);

// mergeExtras: cria as chaves que faltam sem encostar nas que já têm valor.
// O `||` da esquerda para a direita faz o que já está gravado vencer o default.
await sql`
  UPDATE marketing.projects
  SET settings = jsonb_set(settings, '{mergeExtras}',
        '{"link_sala":"","link_gravacao":"","link_pdf":""}'::jsonb
        || COALESCE(settings->'mergeExtras', '{}'::jsonb))
  WHERE id = ${projectId}`;
const [{ mergeExtras }] = await sql`
  SELECT settings->'mergeExtras' AS "mergeExtras" FROM marketing.projects WHERE id = ${projectId}`;
console.log(
  `links da campanha ......... ${
    Object.entries(mergeExtras).filter(([, v]) => v).map(([k]) => k).join(', ') || '(todos vazios)'
  }`,
);

// ─── 2. Audiências ─────────────────────────────────────────────────────────
// Não há índice único em (project_id, name): buscar-antes-de-inserir é o que
// garante idempotência ao re-rodar o seed.
async function upsertAudience(name, description, source, fill) {
  const ex = await sql`
    SELECT id FROM marketing.audiences WHERE project_id = ${projectId} AND name = ${name} LIMIT 1`;
  let id = ex[0]?.id;
  if (!id) {
    const a = await sql`
      INSERT INTO marketing.audiences (project_id, name, description, source, source_meta)
      VALUES (${projectId}, ${name}, ${description}, ${source}, '{}'::jsonb)
      RETURNING id`;
    id = a[0].id;
  }
  if (fill) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${id}`;
    await fill(id);
  }
  await sql`
    UPDATE marketing.audiences SET contact_count =
      (SELECT count(*) FROM marketing.list_members WHERE audience_id = ${id})
    WHERE id = ${id}`;
  const n = await sql`SELECT count(*)::int AS n FROM marketing.list_members WHERE audience_id = ${id}`;
  console.log(`audiência ................. #${id} ${name.padEnd(42)} → ${n[0].n}`);
  return id;
}

// As audiências de origem, na campanha Impositivas SP.
const [{ id: audOrigemBase }] = await sql`
  SELECT a.id FROM marketing.audiences a JOIN marketing.projects p ON p.id = a.project_id
  WHERE p.slug = ${SLUG_ORIGEM} AND a.name = 'Câmaras SP — Base completa (e-mail)' LIMIT 1`;
const [{ id: audOrigemWa }] = await sql`
  SELECT a.id FROM marketing.audiences a JOIN marketing.projects p ON p.id = a.project_id
  WHERE p.slug = ${SLUG_ORIGEM} AND a.name = 'Câmaras SP — WhatsApp' LIMIT 1`;

// VIP: quem já levantou a mão na campanha que acabou de parar — respondeu no
// WhatsApp, clicou num e-mail ou pediu material. São as 127 oportunidades
// paradas em "contato inicial" mais os 53 que responderam. Recebem convite que
// reconhece o contato anterior, não a peça fria.
const audVip = await upsertAudience(
  'Webinar — VIP (já levantou a mão)',
  'Respondeu no WhatsApp, clicou em e-mail ou pediu material na campanha Impositivas SP.',
  'crm_segment',
  async (id) => {
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT DISTINCT ${id}::int, e.contact_id
      FROM marketing.events e
      JOIN marketing.list_members lm ON lm.contact_id = e.contact_id AND lm.audience_id = ${audOrigemBase}
      JOIN marketing.contacts c ON c.id = e.contact_id
      WHERE e.type IN ('wa_replied','click','lp_report_request')
        AND c.status = 'active'
      ON CONFLICT DO NOTHING`;
  },
);

// Base do E1: todo mundo MENOS os VIP, que recebem a peça própria no mesmo
// dia. Sem esse recorte o VIP receberia as duas — e a fria depois da pessoal.
const audBase = await upsertAudience(
  'Webinar — Base completa (e-mail)',
  'Presidentes de Câmara de SP que não estão na audiência VIP.',
  'crm_segment',
  async (id) => {
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${id}::int, lm.contact_id
      FROM marketing.list_members lm
      JOIN marketing.contacts c ON c.id = lm.contact_id
      WHERE lm.audience_id = ${audOrigemBase}
        AND c.status = 'active'
        AND lm.contact_id NOT IN (SELECT contact_id FROM marketing.list_members WHERE audience_id = ${audVip})
      ON CONFLICT DO NOTHING`;
  },
);

const audWa = await upsertAudience(
  'Webinar — WhatsApp (convite)',
  'Presidentes com celular válido para template Meta.',
  'crm_segment',
  async (id) => {
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${id}::int, lm.contact_id
      FROM marketing.list_members lm
      JOIN marketing.contacts c ON c.id = lm.contact_id
      WHERE lm.audience_id = ${audOrigemWa} AND c.status = 'active' AND c.whatsapp IS NOT NULL
      ON CONFLICT DO NOTHING`;
  },
);

// As duas trilhas. Nascem VAZIAS de propósito e são reconstruídas a cada
// rodada por rebuild-audiences.mjs (e pelo cron): é esse recálculo que faz
// ninguém receber "inscreva-se" depois de ter se inscrito.
const audIn = await upsertAudience(
  'Webinar — Inscritos (W-IN)',
  'Dinâmica: tem a tag webinar:inscrito. Reconstruída a cada rodada do cron.',
  'crm_segment',
  null,
);
const audOut = await upsertAudience(
  'Webinar — Não inscritos (W-OUT)',
  'Dinâmica: recebeu alguma peça, não tem a tag webinar:inscrito, não descadastrou.',
  'crm_segment',
  null,
);
const audOutWa = await upsertAudience(
  'Webinar — Não inscritos com WhatsApp',
  'Dinâmica: subconjunto da W-OUT que tem celular.',
  'crm_segment',
  null,
);
const audPresentes = await upsertAudience(
  'Webinar — Inscritos presentes',
  'Dinâmica: attributes.webinar_presente = true, do CSV de presença do Meet.',
  'crm_segment',
  null,
);
const audAusentes = await upsertAudience(
  'Webinar — Inscritos ausentes',
  'Dinâmica: inscrito sem presença confirmada no relatório do Meet.',
  'crm_segment',
  null,
);
const audTeste = await upsertAudience(
  'ZZ Teste webinar (não usar em disparo real)',
  'Prefixo ZZ: fica fora de toda contagem, trilha e oportunidade.',
  'crm_segment',
  null,
);

await sql`
  UPDATE marketing.projects
  SET settings = settings || ${JSON.stringify({
    audienceIds: {
      vip: audVip,
      base: audBase,
      wa: audWa,
      in: audIn,
      out: audOut,
      outWa: audOutWa,
      presentes: audPresentes,
      ausentes: audAusentes,
      teste: audTeste,
    },
    audienciaOrigemBase: audOrigemBase,
    audienciaOrigemWa: audOrigemWa,
  })}::jsonb
  WHERE id = ${projectId}`;

// ─── 3. Templates ──────────────────────────────────────────────────────────
const tplIds = {};
for (const e of EMAILS) {
  const html = renderEmail(e);
  const vars = [...new Set([...html.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]))];
  const ex = await sql`
    SELECT id FROM marketing.templates WHERE project_id = ${projectId} AND name = ${e.name} LIMIT 1`;
  let id = ex[0]?.id;
  if (id) {
    await sql`
      UPDATE marketing.templates
      SET subject = ${e.subject}, html = ${html}, variables = ${vars}::text[],
          status = 'active', updated_at = NOW()
      WHERE id = ${id}`;
  } else {
    const r = await sql`
      INSERT INTO marketing.templates (project_id, channel, name, subject, html, variables, status)
      VALUES (${projectId}, 'email', ${e.name}, ${e.subject}, ${html}, ${vars}::text[], 'active')
      RETURNING id`;
    id = r[0].id;
  }
  tplIds[e.key] = id;
}
console.log(`templates e-mail .......... ${EMAILS.length}`);

// WhatsApp: o Content SID (HX…) é preenchido por submit-wa-templates.mjs.
for (const w of WA_TEMPLATES) {
  const ex = await sql`
    SELECT id FROM marketing.templates WHERE project_id = ${projectId} AND name = ${w.friendly} LIMIT 1`;
  let id = ex[0]?.id;
  const buttons = w.urlButton ? [{ type: 'URL', ...w.urlButton }] : [];
  if (id) {
    await sql`
      UPDATE marketing.templates
      SET text = ${w.body}, wa_buttons = ${JSON.stringify(buttons)}::jsonb,
          variables = ${w.variables}::text[], updated_at = NOW()
      WHERE id = ${id}`;
  } else {
    const r = await sql`
      INSERT INTO marketing.templates
        (project_id, channel, name, text, category, wa_buttons, variables, status)
      VALUES (${projectId}, 'whatsapp', ${w.friendly}, ${w.body}, ${w.category},
              ${JSON.stringify(buttons)}::jsonb, ${w.variables}::text[], 'draft')
      RETURNING id`;
    id = r[0].id;
  }
  tplIds[w.key] = id;
}
console.log(`templates WhatsApp ........ ${WA_TEMPLATES.length} (aguardando Content SID da Meta)`);

// ─── 3b. Sequência de confirmação ──────────────────────────────────────────
// A confirmação é a peça que hoje NÃO existe: o Resend do Heitor está em
// sandbox e só entrega na caixa dele, então quem se inscreve não recebe nada.
// Aqui ela sai pelo Brevo, com o link da sala, na primeira rodada do cron
// depois da inscrição (≤5 min) — o webhook matricula, o runner envia.
//
// exitOnTag NÃO pode ser a tag de inscrição: todo mundo que entra nesta régua
// acabou de ganhá-la, e o runner exclui antes de enviar. Usamos a tag de quem
// já agendou demonstração, que é o motivo legítimo de parar a régua.
const stepsConf = {
  steps: [{ templateId: tplIds.ECONF, delayDays: 0 }],
  exitOnTag: 'webinar:agendou',
};
const seqEx = await sql`
  SELECT id FROM marketing.sequences
  WHERE project_id = ${projectId} AND name = 'Confirmação de inscrição · Webinar' LIMIT 1`;
let confSequenceId = seqEx[0]?.id;
if (confSequenceId) {
  await sql`UPDATE marketing.sequences SET steps = ${JSON.stringify(stepsConf)}::jsonb WHERE id = ${confSequenceId}`;
} else {
  const r = await sql`
    INSERT INTO marketing.sequences (project_id, name, steps, status)
    VALUES (${projectId}, 'Confirmação de inscrição · Webinar', ${JSON.stringify(stepsConf)}::jsonb, 'active')
    RETURNING id`;
  confSequenceId = r[0].id;
}
await sql`
  UPDATE marketing.projects
  SET settings = settings || ${JSON.stringify({ posSequenceId: confSequenceId, confSequenceId })}::jsonb
  WHERE id = ${projectId}`;
console.log(`sequência confirmação ..... #${confSequenceId} (dispara no ato da inscrição)`);

// ─── 4. Campanhas ──────────────────────────────────────────────────────────
// `tpl` é a chave da peça em emails.mjs; W3/W4 e W5/W5b compartilham template
// (a diferença entre eles é variável, não estrutura — um pedido a menos na
// fila da Meta).
const PLANO = [
  { key: 'E1', tpl: 'E1', nome: 'E1 · Convite ao webinar (base)', aud: audBase, canal: 'email', rate: 40 },
  { key: 'E0', tpl: 'E0', nome: 'E0 · Convite VIP (já levantou a mão)', aud: audVip, canal: 'email', rate: 30 },
  { key: 'W1', tpl: 'W1', nome: 'W1 · WhatsApp convite (botão de URL)', aud: audWa, canal: 'whatsapp', rate: 25 },
  { key: 'E2', tpl: 'E2', nome: 'E2 · Conteúdo (não inscritos)', aud: audOut, canal: 'email', rate: 40 },
  { key: 'E3', tpl: 'E3', nome: 'E3 · Véspera (inscritos)', aud: audIn, canal: 'email', rate: 40 },
  { key: 'W2', tpl: 'W2', nome: 'W2 · WhatsApp reforço (não inscritos)', aud: audOutWa, canal: 'whatsapp', rate: 25 },
  { key: 'W3', tpl: 'W34', nome: 'W3 · WhatsApp véspera (inscritos)', aud: audIn, canal: 'whatsapp', rate: 25 },
  { key: 'E4', tpl: 'E4', nome: 'E4 · Dia do evento (inscritos)', aud: audIn, canal: 'email', rate: 40 },
  { key: 'W4', tpl: 'W34', nome: 'W4 · WhatsApp dia do evento (inscritos)', aud: audIn, canal: 'whatsapp', rate: 25 },
  { key: 'E5', tpl: 'E5', nome: 'E5 · Gravação + demonstração (presentes)', aud: audPresentes, canal: 'email', rate: 40 },
  { key: 'W5', tpl: 'W55b', nome: 'W5 · WhatsApp gravação (presentes)', aud: audPresentes, canal: 'whatsapp', rate: 25 },
  { key: 'W5b', tpl: 'W55b', nome: 'W5b · WhatsApp gravação (ausentes)', aud: audAusentes, canal: 'whatsapp', rate: 25 },
  { key: 'E6', tpl: 'E6', nome: 'E6 · Não compareceu (inscritos ausentes)', aud: audAusentes, canal: 'email', rate: 40 },
  { key: 'E7', tpl: 'E7', nome: 'E7 · Gravação (não inscritos)', aud: audOut, canal: 'email', rate: 40 },
  { key: 'W6', tpl: 'W6', nome: 'W6 · WhatsApp encerramento', aud: audOutWa, canal: 'whatsapp', rate: 25 },
];

for (const c of PLANO) {
  const provider = c.canal === 'whatsapp' ? 'twilio' : 'brevo';
  const ex = await sql`
    SELECT id FROM marketing.campaigns WHERE project_id = ${projectId} AND name = ${c.nome} LIMIT 1`;
  let id = ex[0]?.id;
  if (id) {
    // Campanha já disparada não é alterada — só as que ainda não saíram.
    await sql`
      UPDATE marketing.campaigns
      SET audience_id = ${c.aud}, template_id = ${tplIds[c.tpl]}, scheduled_at = ${CAL[c.key]}::timestamp,
          provider = ${provider}, rate_per_minute = ${c.rate}, updated_at = NOW()
      WHERE id = ${id} AND status IN ('draft','scheduled')`;
  } else {
    const r = await sql`
      INSERT INTO marketing.campaigns
        (project_id, audience_id, template_id, name, status, scheduled_at, provider, rate_per_minute, total_recipients)
      VALUES (${projectId}, ${c.aud}, ${tplIds[c.tpl]}, ${c.nome}, 'draft', ${CAL[c.key]}::timestamp,
              ${provider}, ${c.rate}, 0)
      RETURNING id`;
    id = r[0].id;
  }
  const dia = CAL[c.key].slice(0, 10).split('-').reverse().slice(0, 2).join('/');
  const hora = CAL[c.key].slice(11, 16);
  console.log(`campanha .................. #${String(id).padEnd(4)} ${c.nome.padEnd(42)} ${dia} ${hora}Z · ${provider}`);
}

console.log('\nTudo em draft — nada dispara sozinho.');
console.log('Próximos: submit-wa-templates.mjs → rebuild-audiences.mjs → test-send.mjs → arm.mjs');
