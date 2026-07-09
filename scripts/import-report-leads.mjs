/**
 * import-report-leads.mjs
 * -----------------------------------------------------------------------------
 * Sobe ao CRM as interações do relatório "Consultoria FUNDEB · Inteligência de
 * Captação" (onda jun/2026: Sorocaba LP+stand · Marília · novos leads).
 *
 * Subcomandos:
 *   migrate  → move TODAS as oportunidades em stage 'novo' para 'contato_inicial'
 *              (saneamento único; ignora os leads criados por este import, que
 *              carregam a tag-marcador 'import-jun2026').
 *   import   → para cada cidade do relatório: ENRIQUECE a oportunidade existente
 *              (tags de origem + timeline + contatos) ou CRIA uma nova em 'novo'.
 *              Idempotente: dedup por município, por contato (email/nome) e por
 *              atividade (subject+data). Pode rodar quantas vezes quiser.
 *
 * Por padrão roda em DRY-RUN (não grava nada). Use --apply para efetivar.
 *
 *   node scripts/import-report-leads.mjs migrate            # prévia
 *   node scripts/import-report-leads.mjs migrate --apply    # efetiva (rodar 1x)
 *   node scripts/import-report-leads.mjs import             # prévia
 *   node scripts/import-report-leads.mjs import  --apply    # efetiva
 *   node scripts/import-report-leads.mjs all     --apply    # migrate + import
 * -----------------------------------------------------------------------------
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) ?? 'all';
const APPLY = argv.includes('--apply');
const MARKER = 'import-jun2026';

const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function parseDate(d) {
  // 'dd/mm' -> 2026-mm-dd ; 'jun' -> 15/06 ; 'mai' -> 15/05
  if (/^\d{2}\/\d{2}$/.test(d)) {
    const [dd, mm] = d.split('/');
    return new Date(Date.UTC(2026, Number(mm) - 1, Number(dd), 12));
  }
  if (d === 'jun') return new Date(Date.UTC(2026, 5, 15, 12));
  if (d === 'mai') return new Date(Date.UTC(2026, 4, 15, 12));
  return new Date(Date.UTC(2026, 5, 15, 12));
}

// ─── Taxonomia de tags a garantir ───────────────────────────────────────────
const TAGS = [
  { label: 'Sorocaba LP', category: 'origem', color: 'blue' },
  { label: 'Sorocaba Stand', category: 'origem', color: 'cyan' },
  { label: 'Marília Stand', category: 'origem', color: 'emerald' },
  { label: 'PB Smart Cities', category: 'origem', color: 'rose' },
  { label: 'Indicação', category: 'origem', color: 'indigo' },
  { label: 'WhatsApp APM', category: 'origem', color: 'pink' },
  { label: 'Escola Online', category: 'produto', color: 'violet' },
];

// ─── Dataset do relatório ────────────────────────────────────────────────────
// origin: tags de origem · produto: tags de produto · src: source da oportunidade
// nova · contacts: [{name,role,email,phone}] · acts: [{d,type,subject,body}]
const LP = (date, name, role, email, phone) => ({
  d: date, type: 'note', subject: 'Clicou na LP (relatório FUNDEB)',
  body: `${name}${role ? ' — ' + role : ''}${email ? ' · ' + email : ''}${phone ? ' · ' + phone : ''}`,
});
const REQ = (date) => ({ d: date, type: 'note', subject: 'Pediu relatório na LP', body: '"Quero meu relatório" — LP sorocaba-2026.' });
const STAND = (date, label) => ({ d: date, type: 'note', subject: 'Agendou diagnóstico no stand', body: label });

const DATA = [
  // ── SOROCABA — cliques de LP (planilha) + quero-relatório + stand ──
  { n: 'Alambari', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'João Paulo Dantas Pinto', role: 'Prefeito/Gabinete', email: 'gabinete@alambari.sp.gov.br' }],
    acts: [LP('19/06', 'João Paulo Dantas Pinto', 'Prefeito/Gabinete', 'gabinete@alambari.sp.gov.br'), REQ('21/06')] },
  { n: 'Araçoiaba da Serra', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Jose Carlos de Quevedo Junior', role: 'Prefeito/Gabinete', email: 'quevedo-junior@hotmail.com', phone: '(15) 99755-9280' }],
    acts: [LP('19/06', 'Jose Carlos de Quevedo Junior', 'Prefeito/Gabinete', 'quevedo-junior@hotmail.com', '(15) 99755-9280')] },
  { n: 'Bofete', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Eugenio Carlos Alves', role: 'Prefeito/Gabinete', email: 'gabinete@bofete.sp.gov.br' }],
    acts: [LP('17/06', 'Eugenio Carlos Alves', 'Prefeito/Gabinete', 'gabinete@bofete.sp.gov.br')] },
  { n: 'Capela do Alto', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Simone de Oliveira Becca Caetano', role: 'Sec. Finanças', email: 'financeiro@capeladoalto.sp.gov.br' }],
    acts: [LP('18/06', 'Simone de Oliveira Becca Caetano', 'Sec. Finanças', 'financeiro@capeladoalto.sp.gov.br')] },
  { n: 'Cerqueira César', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Ronaldo Adão Guardiano', role: 'Sec. Finanças', email: 'secretariaplanejamento@cerqueiracesar.sp.gov.br' }],
    acts: [LP('18/06', 'Ronaldo Adão Guardiano', 'Sec. Finanças', 'secretariaplanejamento@cerqueiracesar.sp.gov.br'), REQ('22/06')] },
  { n: 'Iaras', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Valdemar Gomes Del Peso Cortez', role: 'Outras sec.', email: 'saude@iaras.sp.gov.br' }],
    acts: [LP('18/06', 'Valdemar Gomes Del Peso Cortez', 'Outras sec.', 'saude@iaras.sp.gov.br')] },
  { n: 'Ibiúna', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [
      { name: 'Mario Pires de Oliveira Filho', role: 'Prefeito/Gabinete', email: 'administracao@ibiuna.sp.gov.br' },
      { name: 'Paulo Cesar Dias de Moraes', role: 'Pres. Câmara', email: 'camaraibiuna@camaraibiuna.sp.gov.br' }],
    acts: [LP('18/06', 'Mario Pires de Oliveira Filho', 'Prefeito/Gabinete', 'administracao@ibiuna.sp.gov.br'),
      LP('18/06', 'Paulo Cesar Dias de Moraes', 'Pres. Câmara', 'camaraibiuna@camaraibiuna.sp.gov.br')] },
  { n: 'Iperó', uf: 'SP', origin: ['Sorocaba LP', 'Sorocaba Stand'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Sulevan Aparecido Cruz Silva', role: 'Sec. Educação', email: 'educacao@ipero.sp.gov.br' }],
    acts: [LP('18/06', 'Sulevan Aparecido Cruz Silva', 'Sec. Educação', 'educacao@ipero.sp.gov.br'), STAND('18/06', 'Smart Cities Park (Sorocaba)')] },
  { n: 'Jumirim', uf: 'SP', origin: ['Sorocaba LP', 'WhatsApp APM'], src: 'lp_sorocaba-2026',
    contacts: [
      { name: 'Ana Teresa Cinto Fávero', role: 'Sec. Educação', email: 'educacao@jumirim.sp.gov.br' },
      { name: 'Daniel Vieira', role: 'Prefeito/Gabinete', email: 'gabinete@jumirim.sp.gov.br' }],
    acts: [LP('17/06', 'Ana Teresa Cinto Fávero', 'Sec. Educação', 'educacao@jumirim.sp.gov.br'),
      LP('17/06', 'Daniel Vieira', 'Prefeito/Gabinete', 'gabinete@jumirim.sp.gov.br'),
      { d: '18/06', type: 'whatsapp', subject: 'Contato WhatsApp (Grupo APM)', body: 'Falou com Ana Tereza (Sec. Educação); aguardando agenda. Reforço 22/06.' }] },
  { n: 'Pardinho', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Rivaldo Ebúrneo Rosa', role: 'Pres. Câmara', email: 'camara@camarapardinho.sp.gov.br' }],
    acts: [LP('18/06', 'Rivaldo Ebúrneo Rosa', 'Pres. Câmara', 'camara@camarapardinho.sp.gov.br')] },
  { n: 'Pilar do Sul', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Karla Tathiane Nishi Padula Pegeanotto', role: 'Pres. Câmara', email: 'legislativo@camarapilardosul.sp.gov.br' }],
    acts: [LP('17/06', 'Karla Tathiane Nishi Padula Pegeanotto', 'Pres. Câmara', 'legislativo@camarapilardosul.sp.gov.br')] },
  { n: 'Porto Feliz', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [
      { name: 'Antonio Cássio Habice Prado', role: 'Prefeito', email: 'prefeito@portofeliz.sp.gov.br', phone: '(15) 99114-3766' },
      { name: 'Saulo Henrique Cândido', role: 'Sec. Finanças', email: 'secretario.desenvolvimento@portofeliz.sp.gov.br' }],
    acts: [LP('17/06', 'Antonio Cássio Habice Prado', 'Prefeito', 'prefeito@portofeliz.sp.gov.br', '(15) 99114-3766'),
      LP('17/06', 'Saulo Henrique Cândido', 'Sec. Finanças', 'secretario.desenvolvimento@portofeliz.sp.gov.br')] },
  { n: 'Salto', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'José Geraldo Garcia', role: 'Prefeito/Gabinete', email: 'gabineteprefeito@salto.sp.gov.br' }],
    acts: [LP('17/06', 'José Geraldo Garcia', 'Prefeito/Gabinete', 'gabineteprefeito@salto.sp.gov.br'), REQ('24/06')] },
  { n: 'Sarapuí', uf: 'SP', origin: ['Sorocaba LP', 'Sorocaba Stand'], src: 'lp_sorocaba-2026',
    contacts: [
      { name: 'Lucas da Silva Antunes', role: 'Pres. Câmara', email: 'admcm@camarasarapui.sp.gov.br' },
      { name: 'Everson Carlos de Oliveira', role: 'Outras sec.', email: 'seguranca@sarapui.sp.gov.br' }],
    acts: [STAND('17/06', 'Smart Cities Park (Sorocaba)'),
      LP('17/06', 'Everson Carlos de Oliveira', 'Outras sec.', 'seguranca@sarapui.sp.gov.br'),
      LP('18/06', 'Lucas da Silva Antunes', 'Pres. Câmara', 'admcm@camarasarapui.sp.gov.br'),
      STAND('18/06', 'Smart Cities Park (Sorocaba) — 2ª vez'), REQ('24/06')] },
  { n: 'São Manuel', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Mario Batissoco', role: 'Sec. Finanças', email: 'mario.batissoco@saomanuel.sp.gov.br' }],
    acts: [LP('18/06', 'Mario Batissoco', 'Sec. Finanças', 'mario.batissoco@saomanuel.sp.gov.br')] },
  { n: 'Tapiraí', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Alice Helena Parlemo e Silva', role: 'Outras sec.', email: 'saude@tapirai.sp.gov.br' }],
    acts: [LP('17/06', 'Alice Helena Parlemo e Silva', 'Outras sec.', 'saude@tapirai.sp.gov.br')] },
  { n: 'Torre de Pedra', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Simone', role: 'Sec. Educação', email: 'educacao@torredepedra.sp.gov.br' }],
    acts: [LP('17/06', 'Simone', 'Sec. Educação', 'educacao@torredepedra.sp.gov.br')] },
  { n: 'Votorantim', uf: 'SP', origin: ['Sorocaba LP', 'Sorocaba Stand'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Tiago Antonio de Araújo', role: 'Sec. Educação', email: 'seed@votorantim.sp.gov.br' }],
    acts: [LP('18/06', 'Tiago Antonio de Araújo', 'Sec. Educação', 'seed@votorantim.sp.gov.br'), STAND('18/06', 'Smart Cities Park (Sorocaba)')] },
  { n: 'Águas de Santa Bárbara', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026',
    contacts: [{ name: 'Claudio Otávio Ignácio Barboza', role: 'Pres. Câmara', email: 'claudio@camaraasb.sp.gov.br' }],
    acts: [LP('17/06', 'Claudio Otávio Ignácio Barboza', 'Pres. Câmara', 'claudio@camaraasb.sp.gov.br')] },
  { n: 'Manduri', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026', contacts: [], acts: [REQ('25/06')] },
  { n: 'Cerquilho', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026', contacts: [], acts: [REQ('24/06')] },
  { n: 'Sorocaba', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026', contacts: [], acts: [REQ('24/06')] },
  { n: 'Cesário Lange', uf: 'SP', origin: ['Sorocaba LP'], src: 'lp_sorocaba-2026', contacts: [], acts: [REQ('22/06')] },
  // ── MARÍLIA — agendamentos no stand ──
  { n: 'Oscar Bressane', uf: 'SP', origin: ['Marília Stand'], src: 'agendamento_marilia-2026', contacts: [], acts: [STAND('29/06', 'Smart Cities Park (Marília)')] },
  { n: 'Quatá', uf: 'SP', origin: ['Marília Stand'], src: 'agendamento_marilia-2026', contacts: [], acts: [STAND('26/06', 'Smart Cities Park (Marília)')] },
  { n: 'Santa Cruz do Rio Pardo', uf: 'SP', origin: ['Marília Stand'], src: 'agendamento_marilia-2026', contacts: [], acts: [STAND('25/06', 'Smart Cities Park (Marília)')] },
  { n: 'Echaporã', uf: 'SP', origin: ['Marília Stand'], src: 'agendamento_marilia-2026', contacts: [], acts: [STAND('25/06', 'Smart Cities Park (Marília)')] },
  // ── LEADS NOVOS / MANUAIS ──
  { n: 'Santa Branca', uf: 'SP', origin: ['Indicação'], produto: ['Escola Online'], src: 'reuniao_zoom',
    contacts: [{ name: 'Secretaria de Educação', role: 'Secretaria de Educação', email: 'educacao@santabranca.sp.gov.br' }],
    acts: [
      { d: 'jun', type: 'note', subject: 'Reunião por Zoom — Secretaria de Educação', body: 'Reunião com a Secretaria de Educação; quer avançar (não estava no CRM).' },
      { d: 'jun', type: 'note', subject: 'Interesse: FUNDEB + Escola Online', body: 'Quer DOIS produtos: assessoria FUNDEB + Sistema Escola Online.' }] },
  { n: 'Maximiliano de Almeida', uf: 'RS', origin: ['Indicação'], src: 'Contato Rosi',
    contacts: [{ name: 'André (Prefeito)', role: 'Prefeito' }, { name: 'Claudio (Vice-Prefeito)', role: 'Vice-Prefeito' }, { name: 'Flavio', role: 'Sec. Educação' }],
    acts: [
      { d: '22/06', type: 'note', subject: 'Reunião realizada', body: 'Prefeito André, Vice Claudio, Sec. Educação Flavio e assistente Andrea (contato da Rosi).' },
      { d: '22/06', type: 'proposal_sent', subject: 'Relatório apresentado', body: 'Relatório apresentado — vamos enviar cotação.' }] },
  // ── PB SMART CITIES — agendamentos ──
  { n: 'Guarabira', uf: 'PB', origin: ['PB Smart Cities'], src: 'agendamento_pb-smart-cities-2026', contacts: [], acts: [STAND('03/06', 'Smart Cities Park (PB)')] },
  { n: 'Barra de São Miguel', uf: 'PB', origin: ['PB Smart Cities'], src: 'agendamento_pb-smart-cities-2026', contacts: [], acts: [STAND('08/06', 'Smart Cities Park (PB)')] },
  { n: 'Frei Martinho', uf: 'PB', origin: ['PB Smart Cities'], src: 'agendamento_pb-smart-cities-2026', contacts: [], acts: [STAND('03/06', 'Smart Cities Park (PB)')] },
];

const stats = { tagsCreated: 0, migrated: 0, created: 0, enriched: 0, actsAdded: 0, contactsAdded: 0, skipped: [] };

async function ensureTags() {
  const existing = await sql`SELECT label FROM crm.tags`;
  const have = new Set(existing.map((r) => norm(r.label)));
  for (const t of TAGS) {
    if (have.has(norm(t.label))) continue;
    const slug = norm(t.label).replace(/\s+/g, '-');
    console.log(`  + tag "${t.label}" (${t.category}/${t.color})`);
    stats.tagsCreated++;
    if (APPLY) {
      await sql`INSERT INTO crm.tags (label, slug, category, color, is_custom, is_active)
                VALUES (${t.label}, ${slug}, ${t.category}, ${t.color}, true, true)
                ON CONFLICT (slug) DO NOTHING`;
    }
  }
}

async function migrate() {
  console.log('\n── MIGRATE: novo → contato_inicial (saneamento único) ──');
  const rows = await sql`
    SELECT o.id, m.nome FROM crm.opportunities o
    LEFT JOIN fundeb.municipalities m ON m.id = o.municipality_id
    WHERE o.stage = 'novo' AND NOT (COALESCE(o.tags, '{}') && ARRAY[${MARKER}]::text[])
    ORDER BY o.id`;
  console.log(`  ${rows.length} oportunidades em 'novo' a mover (excluindo import ${MARKER}).`);
  for (const r of rows) console.log(`    #${r.id} ${r.nome ?? '(sem município)'}`);
  stats.migrated = rows.length;
  if (APPLY && rows.length) {
    const ids = rows.map((r) => r.id);
    await sql`UPDATE crm.opportunities
              SET stage='contato_inicial', stage_updated_at=now(), updated_at=now()
              WHERE id = ANY(${ids})`;
    for (const id of ids) {
      await sql`INSERT INTO crm.activities (opportunity_id, type, subject, body, metadata)
                VALUES (${id}, 'stage_change', 'Novo → Contato Inicial',
                        'Saneamento do funil (migração jun/2026).',
                        ${JSON.stringify({ from: 'novo', to: 'contato_inicial', migration: 'import-jun2026' })}::jsonb)`;
    }
  }
}

async function findMunicipality(name, uf) {
  const rows = await sql`SELECT id, nome, uf FROM fundeb.municipalities WHERE uf = ${uf}`;
  return rows.find((r) => norm(r.nome) === norm(name)) || null;
}

async function findOpportunity(municipalityId, name) {
  if (municipalityId) {
    const rows = await sql`SELECT * FROM crm.opportunities WHERE municipality_id = ${municipalityId} ORDER BY id LIMIT 1`;
    if (rows[0]) return rows[0];
  }
  // fallback: município sem id na base (ex.: nome em notes)
  const rows = await sql`SELECT * FROM crm.opportunities WHERE notes ILIKE ${'%' + name + '%'} ORDER BY id LIMIT 1`;
  return rows[0] || null;
}

async function addTags(oppId, current, labels) {
  const have = new Set((current || []).map((t) => norm(t)));
  const add = labels.filter((l) => !have.has(norm(l)));
  if (!add.length) return current || [];
  const next = [...(current || []), ...add];
  if (APPLY) await sql`UPDATE crm.opportunities SET tags=${next}, updated_at=now() WHERE id=${oppId}`;
  return next;
}

async function addActivities(oppId, acts) {
  const existing = await sql`SELECT subject, occurred_at FROM crm.activities WHERE opportunity_id=${oppId}`;
  const seen = new Set(existing.map((a) => norm(a.subject) + '|' + (a.occurred_at ? new Date(a.occurred_at).toISOString().slice(0, 10) : '')));
  for (const a of acts) {
    const when = parseDate(a.d);
    const key = norm(a.subject) + '|' + when.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    console.log(`      · atividade ${a.d} ${a.subject}`);
    stats.actsAdded++;
    if (APPLY) {
      await sql`INSERT INTO crm.activities (opportunity_id, type, subject, body, occurred_at, metadata)
                VALUES (${oppId}, ${a.type}, ${a.subject}, ${a.body ?? null}, ${when.toISOString()},
                        ${JSON.stringify({ import: 'jun2026' })}::jsonb)`;
    }
    seen.add(key);
  }
}

async function addContacts(oppId, contacts) {
  if (!contacts?.length) return;
  const existing = await sql`SELECT name, email FROM crm.contacts WHERE opportunity_id=${oppId}`;
  const seenEmail = new Set(existing.filter((c) => c.email).map((c) => norm(c.email)));
  const seenName = new Set(existing.map((c) => norm(c.name)));
  let first = existing.length === 0;
  for (const c of contacts) {
    if ((c.email && seenEmail.has(norm(c.email))) || seenName.has(norm(c.name))) continue;
    console.log(`      · contato ${c.name}${c.role ? ' (' + c.role + ')' : ''}`);
    stats.contactsAdded++;
    if (APPLY) {
      await sql`INSERT INTO crm.contacts (opportunity_id, name, role, email, phone, is_primary)
                VALUES (${oppId}, ${c.name}, ${c.role ?? null}, ${c.email ?? null}, ${c.phone ?? null}, ${first})`;
    }
    if (c.email) seenEmail.add(norm(c.email));
    seenName.add(norm(c.name));
    first = false;
  }
}

async function importLeads() {
  console.log('\n── IMPORT: enriquecer existentes / criar faltantes ──');
  for (const city of DATA) {
    const muni = await findMunicipality(city.n, city.uf);
    if (!muni && city.uf === 'SP') {
      stats.skipped.push(`${city.n}/${city.uf} (sem município na base fundeb)`);
    }
    const opp = await findOpportunity(muni?.id, city.n);
    const tagsToAdd = [...(city.origin || []), ...(city.produto || [])];

    if (opp) {
      console.log(`  ~ ENRIQUECER #${opp.id} ${city.n}/${city.uf} [${opp.stage}]`);
      stats.enriched++;
      await addTags(opp.id, opp.tags, tagsToAdd);
      await addContacts(opp.id, city.contacts);
      await addActivities(opp.id, city.acts);
    } else {
      if (!muni) { stats.skipped.push(`${city.n}/${city.uf} (sem município e sem oportunidade)`); continue; }
      console.log(`  + CRIAR (novo) ${city.n}/${city.uf}`);
      stats.created++;
      const tags = [...tagsToAdd, MARKER];
      let newId = null;
      if (APPLY) {
        const ins = await sql`
          INSERT INTO crm.opportunities (municipality_id, stage, source, tags, notes, created_at, updated_at, stage_updated_at, last_activity_at)
          VALUES (${muni.id}, 'novo', ${city.src}, ${tags}, ${'Importado do relatório FUNDEB (onda jun/2026).'}, now(), now(), now(), now())
          RETURNING id`;
        newId = ins[0].id;
      }
      if (newId) {
        await addContacts(newId, city.contacts);
        await addActivities(newId, city.acts);
      } else {
        // dry-run: ainda mostra o que entraria
        for (const c of city.contacts || []) console.log(`      · contato ${c.name}`);
        for (const a of city.acts) console.log(`      · atividade ${a.d} ${a.subject}`);
      }
    }
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────
console.log(`\n=== import-report-leads · cmd=${cmd} · ${APPLY ? 'APPLY (gravando)' : 'DRY-RUN (prévia)'} ===`);
console.log('Garantindo taxonomia de tags…');
await ensureTags();
if (cmd === 'migrate' || cmd === 'all') await migrate();
if (cmd === 'import' || cmd === 'all') await importLeads();

console.log('\n── RESUMO ──');
console.log(`  tags criadas:        ${stats.tagsCreated}`);
console.log(`  oportunidades movidas (novo→contato_inicial): ${stats.migrated}`);
console.log(`  oportunidades criadas (novo):  ${stats.created}`);
console.log(`  oportunidades enriquecidas:    ${stats.enriched}`);
console.log(`  atividades adicionadas:        ${stats.actsAdded}`);
console.log(`  contatos adicionados:          ${stats.contactsAdded}`);
if (stats.skipped.length) {
  console.log(`  ⚠️  ignorados (${stats.skipped.length}):`);
  for (const s of stats.skipped) console.log(`      - ${s}`);
}
if (!APPLY) console.log('\n(Use --apply para efetivar. migrate deve ser rodado UMA vez.)');
console.log('');
