// Semeia a campanha Impositivas SP no CRM. Idempotente: pode rodar de novo
// depois de editar as copies em emails.mjs.
//
//   node scripts/impositivas/seed.mjs
//
// NÃO dispara nada. As campanhas nascem em `draft` com scheduled_at definido;
// quem as arma é scripts/impositivas/arm.mjs (status → scheduled), e só então
// o cron passa a lançá-las na data.
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMAILS, WA_TEMPLATES, renderEmail } from './emails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
let url = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
url = url.trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

const SLUG = 'impositivas-sp';
const LP = 'https://institutoi10.com.br/impositivas-sp';
const WA_NUMBER = '5511947223906';

// Calendário aprovado (horário de Brasília = UTC-3 → 12:00Z ≈ 09:00 BRT)
const CAL = {
  E1: '2026-09-09T12:00:00Z',
  W1: '2026-09-10T13:00:00Z',
  E2: '2026-09-14T12:00:00Z',
  E3: '2026-09-21T12:00:00Z',
  B1: '2026-09-24T12:00:00Z',
  B2: '2026-10-01T12:00:00Z',
  B3: '2026-10-08T13:00:00Z',
  B4: '2026-10-15T12:00:00Z',
};
const CORTE_B = '2026-09-23T12:00:00Z';
const AUD_B = 'Câmaras SP — Trilha B (dinâmica)';

// ─── 1. Projeto ────────────────────────────────────────────────────────────
const settings = {
  provider: 'brevo', // nosso gateway — NÃO o da APM (msgraph/apaulista)
  fromEmail: 'i10@i10.org.br',
  fromName: 'Instituto i10 · Parceria APM',
  replyTo: 'i10@i10.org.br',
  lpBaseUrl: LP,
  waNumber: WA_NUMBER,
  signupTag: `${SLUG}:signup`,
  createOpportunity: true,
  opportunitySource: `lp_${SLUG}`,
  opportunityNotes: 'Pediu diagnóstico de conformidade das emendas impositivas (LP /impositivas-sp).',
  opportunitySubject: 'Inscreveu-se na LP Impositivas SP',
  opportunityOrigin: 'LP /impositivas-sp',
  corteTrilhaB: CORTE_B,
  audienciaTrilhaB: AUD_B,
};

const projRows = await sql`
  INSERT INTO marketing.projects (name, slug, description, status, settings)
  VALUES ('Impositivas SP — Câmaras Municipais', ${SLUG},
          'Campanha i10 × APM para os 645 presidentes de Câmara do estado de SP: sistema de gestão de emendas parlamentares impositivas.',
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

// ─── 2. Contatos ───────────────────────────────────────────────────────────
const contacts = JSON.parse(fs.readFileSync(path.join(__dirname, 'contacts.json'), 'utf8'));
let novos = 0;
for (let i = 0; i < contacts.length; i += 200) {
  const chunk = contacts.slice(i, i + 200);
  for (const c of chunk) {
    const r = await sql`
      INSERT INTO marketing.contacts
        (email, phone, whatsapp, name, ibge, municipio, uf, role, source, attributes, lgpd_basis, status)
      VALUES (${c.email}, ${c.phone}, ${c.whatsapp}, ${c.name}, ${c.ibge}, ${c.municipio}, 'SP',
              ${c.role}, 'apm-camaras-sp', ${JSON.stringify(c.attributes)}::jsonb,
              'legitimate_interest', 'active')
      ON CONFLICT (email) DO UPDATE SET
        -- Contato que já existe de outra campanha: completamos o que falta e
        -- acumulamos a tag, sem mexer em status (respeita descadastro prévio).
        name       = COALESCE(marketing.contacts.name, EXCLUDED.name),
        phone      = COALESCE(marketing.contacts.phone, EXCLUDED.phone),
        whatsapp   = COALESCE(marketing.contacts.whatsapp, EXCLUDED.whatsapp),
        -- município e IBGE vêm da planilha da APM, que é a fonte autoritativa
        -- aqui: bases antigas trazem o nome em caixa alta e sem código, o que
        -- quebraria o agrupamento por município no painel.
        ibge       = EXCLUDED.ibge,
        municipio  = EXCLUDED.municipio,
        uf         = COALESCE(marketing.contacts.uf, EXCLUDED.uf),
        role       = COALESCE(marketing.contacts.role, EXCLUDED.role),
        -- `||` em jsonb SUBSTITUI a chave inteira: mesclar direto apagaria as
        -- tags que o contato já tinha de outras campanhas. Por isso as tags
        -- são reconciliadas à parte, somando sem duplicar.
        attributes = (marketing.contacts.attributes || EXCLUDED.attributes)
          || jsonb_build_object('tags', (
               SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
               FROM jsonb_array_elements(
                 COALESCE(marketing.contacts.attributes->'tags', '[]'::jsonb) ||
                 COALESCE(EXCLUDED.attributes->'tags', '[]'::jsonb)) AS t
             )),
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted`;
    if (r[0]?.inserted) novos += 1;
  }
}
console.log(`contatos .................. ${contacts.length} na planilha · ${novos} novos`);

// ─── 3. Audiências ─────────────────────────────────────────────────────────
// Não há índice único em (project_id, name) nessas tabelas, então
// buscar-antes-de-inserir é o que garante idempotência ao re-rodar o seed.
async function upsertAudience(name, description, source, whereSql) {
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
  if (whereSql) {
    await sql`DELETE FROM marketing.list_members WHERE audience_id = ${id}`;
    await whereSql(id);
    await sql`
      UPDATE marketing.audiences SET contact_count =
        (SELECT count(*) FROM marketing.list_members WHERE audience_id = ${id})
      WHERE id = ${id}`;
  }
  const n = await sql`SELECT count(*)::int AS n FROM marketing.list_members WHERE audience_id = ${id}`;
  console.log(`audiência ................. #${id} ${name} → ${n[0].n}`);
  return id;
}

const emails = contacts.map((c) => c.email);
const emailsWa = contacts.filter((c) => c.whatsapp).map((c) => c.email);

const audBase = await upsertAudience(
  'Câmaras SP — Base completa (e-mail)',
  'Todos os e-mails dos presidentes de Câmara de SP (institucional + pessoal).',
  'csv_upload',
  async (id) => {
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${id}, c.id FROM marketing.contacts c
      WHERE c.email = ANY(${emails}) ON CONFLICT DO NOTHING`;
  },
);

const audWa = await upsertAudience(
  'Câmaras SP — WhatsApp',
  'Presidentes com celular válido para template Meta.',
  'csv_upload',
  async (id) => {
    await sql`
      INSERT INTO marketing.list_members (audience_id, contact_id)
      SELECT ${id}, c.id FROM marketing.contacts c
      WHERE c.email = ANY(${emailsWa}) AND c.whatsapp IS NOT NULL ON CONFLICT DO NOTHING`;
  },
);

// Fica vazia de propósito: o cron a reconstrói depois do corte de 23/09.
const audTrilhaB = await upsertAudience(
  AUD_B,
  'Recalculada pelo cron: recebeu, não clicou e não está na Trilha A.',
  'crm_segment',
  null,
);

// ─── 4. Templates ──────────────────────────────────────────────────────────
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
      SET subject = ${e.subject}, html = ${html}, variables = ${vars}::text[], status = 'active', updated_at = NOW()
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
console.log(`templates e-mail .......... ${Object.keys(tplIds).length} (${Object.entries(tplIds).map(([k, v]) => `${k}#${v}`).join(' ')})`);

// WhatsApp: o Content SID (HX…) é preenchido por submit-wa-templates.mjs.
for (const w of WA_TEMPLATES) {
  const ex = await sql`
    SELECT id FROM marketing.templates WHERE project_id = ${projectId} AND name = ${w.friendly} LIMIT 1`;
  let id = ex[0]?.id;
  if (id) {
    await sql`UPDATE marketing.templates SET text = ${w.body}, updated_at = NOW() WHERE id = ${id}`;
  } else {
    const r = await sql`
      INSERT INTO marketing.templates
        (project_id, channel, name, text, category, wa_buttons, variables, status)
      VALUES (${projectId}, 'whatsapp', ${w.friendly}, ${w.body}, ${w.category},
              ${JSON.stringify(w.buttons)}::jsonb, ${w.variables}::text[], 'draft')
      RETURNING id`;
    id = r[0].id;
  }
  tplIds[w.key] = id;
}
console.log(`templates WhatsApp ........ ${WA_TEMPLATES.length} (aguardando Content SID da Meta)`);

// ─── 5. Sequência da Trilha A ──────────────────────────────────────────────
// A1 no momento do enroll (o cron marca next_send_at = D+1) e A2 três dias
// depois. exitOnTag tira da régua quem agendar.
const steps = {
  steps: [
    { templateId: tplIds.A1, delayDays: 0 },
    { templateId: tplIds.A2, delayDays: 3 },
  ],
  exitOnTag: `${SLUG}:agendou`,
};
const seqEx = await sql`
  SELECT id FROM marketing.sequences
  WHERE project_id = ${projectId} AND name = 'Trilha A · Impositivas SP' LIMIT 1`;
let trilhaASequenceId = seqEx[0]?.id;
if (trilhaASequenceId) {
  await sql`UPDATE marketing.sequences SET steps = ${JSON.stringify(steps)}::jsonb WHERE id = ${trilhaASequenceId}`;
} else {
  const seqRows = await sql`
    INSERT INTO marketing.sequences (project_id, name, steps, status)
    VALUES (${projectId}, 'Trilha A · Impositivas SP', ${JSON.stringify(steps)}::jsonb, 'active')
    RETURNING id`;
  trilhaASequenceId = seqRows[0].id;
}
console.log(`sequência Trilha A ........ #${trilhaASequenceId}`);

await sql`
  UPDATE marketing.projects
  SET settings = settings || ${JSON.stringify({
    trilhaASequenceId,
    posSequenceId: trilhaASequenceId,
  })}::jsonb
  WHERE id = ${projectId}`;

// ─── 6. Campanhas ──────────────────────────────────────────────────────────
const PLANO = [
  { key: 'E1', nome: 'E1 · Abertura (TCE aponta impropriedades)', aud: audBase, canal: 'email', rate: 40 },
  { key: 'W1', nome: 'W1 · WhatsApp abertura', aud: audWa, canal: 'whatsapp', rate: 25 },
  { key: 'E2', nome: 'E2 · Aula aberta 20 min', aud: audBase, canal: 'email', rate: 40 },
  { key: 'E3', nome: 'E3 · Três instâncias + autodiagnóstico', aud: audBase, canal: 'email', rate: 40 },
  { key: 'B1', nome: 'B1 · Duas perguntas diretas (frios)', aud: audTrilhaB, canal: 'email', rate: 40 },
  { key: 'B2', nome: 'B2 · Emendas que ficam na mesa (frios)', aud: audTrilhaB, canal: 'email', rate: 40 },
  { key: 'B3', nome: 'B3 · WhatsApp urgência (frios)', aud: audWa, canal: 'whatsapp', rate: 25 },
  { key: 'B4', nome: 'B4 · Encerramento do ciclo (frios)', aud: audTrilhaB, canal: 'email', rate: 40 },
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
      SET audience_id = ${c.aud}, template_id = ${tplIds[c.key]}, scheduled_at = ${CAL[c.key]}::timestamp,
          provider = ${provider}, rate_per_minute = ${c.rate}, updated_at = NOW()
      WHERE id = ${id} AND status IN ('draft','scheduled')`;
  } else {
    const r = await sql`
      INSERT INTO marketing.campaigns
        (project_id, audience_id, template_id, name, status, scheduled_at, provider, rate_per_minute, total_recipients)
      VALUES (${projectId}, ${c.aud}, ${tplIds[c.key]}, ${c.nome}, 'draft', ${CAL[c.key]}::timestamp,
              ${provider}, ${c.rate}, 0)
      RETURNING id`;
    id = r[0].id;
  }
  console.log(`campanha .................. #${id} ${c.nome} · ${CAL[c.key].slice(0, 10)} · ${provider}`);
}

console.log('\nTudo criado em status draft — nada dispara sozinho ainda.');
console.log('Próximos passos: submit-wa-templates.mjs → test-send.mjs → arm.mjs');
