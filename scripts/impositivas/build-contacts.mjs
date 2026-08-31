// Converte a planilha de presidentes de câmaras (APM) no JSON que alimenta o
// seed da campanha Impositivas SP. Roda uma vez, offline:
//   node scripts/impositivas/build-contacts.mjs
//
// Saída: scripts/impositivas/contacts.json  (não versionado — contém PII)
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });
const require = createRequire(import.meta.url);

const XLSX_PATH =
  process.env.XLSX_PATH ??
  '/Users/raphaelruiz/Downloads/Relação Presidentes de Câmaras Municipais.xlsx';

// ─── leitura da planilha ───────────────────────────────────────────────────
const XLSX = require('xlsx');
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

// ─── normalizações ─────────────────────────────────────────────────────────
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Chave de casamento: sem acento, sem pontuação e sem espaços — resolve
// "Aparecida D'Oeste" vs "APARECIDA D OESTE" e afins.
const norm = (s) =>
  stripAccents(String(s ?? ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// "EDER DO NASCIMENTO RUETE" / "Eder do Nascimento Ruete" → "Eder do Nascimento Ruete"
const MINOR = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
function titleCase(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
const firstName = (s) => titleCase(s).split(' ')[0] ?? '';

// A planilha traz 1..n e-mails no mesmo campo, separados por ; ou ,
function splitEmails(raw) {
  return String(raw ?? '')
    .split(/[;,]/)
    // A planilha traz caracteres invisíveis (zero-width space, NBSP) colados em
    // alguns endereços. Eles passam pela validação e só aparecem como recusa do
    // provedor no disparo — uma câmara inteira ficaria sem receber nada.
    .map((e) => e.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

// (18) 99691-9190 → +5518996919190. Só aceitamos celular (9 dígitos, inicia em 9),
// porque o canal é WhatsApp — fixo entraria como número inválido no Twilio.
function toE164Mobile(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  if (local.length !== 11) return null;
  const ddd = local.slice(0, 2);
  const num = local.slice(2);
  if (Number(ddd) < 11 || Number(ddd) > 99) return null;
  if (!num.startsWith('9')) return null;
  return `+55${local}`;
}

// ─── IBGE a partir de fundeb.municipalities ────────────────────────────────
const { neon } = await import('@neondatabase/serverless');
const url = (process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, '');
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
const sql = neon(url);
const munis = await sql`SELECT nome, codigo_ibge FROM fundeb.municipalities WHERE uf = 'SP'`;
const ibgeByName = new Map(munis.map((m) => [norm(m.nome), m.codigo_ibge]));

// Grafias divergentes entre a planilha da APM e a base FUNDEB (Luiz/Luís,
// da/de Posse) e o caso de Embu, renomeada para Embu das Artes em 2011.
const ALIAS = {
  EMBUDASARTES: 'EMBU',
  LUIZANTONIO: 'LUISANTONIO',
  SANTOANTONIODAPOSSE: 'SANTOANTONIODEPOSSE',
  SAOLUISDOPARAITINGA: 'SAOLUIZDOPARAITINGA',
};
const lookupIbge = (municipio) => {
  const k = norm(municipio);
  return ibgeByName.get(k) ?? ibgeByName.get(ALIAS[k] ?? '') ?? null;
};

// ─── montagem ──────────────────────────────────────────────────────────────
const out = [];
const semIbge = [];
const semCelular = [];
const seenEmail = new Set();

for (const r of rows) {
  const municipio = titleCase(r['MUNICÍPIO'] ?? r['MUNICIPIO'] ?? '');
  const presidente = titleCase(r['NOME'] ?? '');
  const emails = splitEmails(r['E-MAIL']);
  const whatsapp = toE164Mobile(r['CELULAR']);
  if (!municipio || !emails.length) continue;

  const ibge = lookupIbge(municipio);
  if (!ibge) semIbge.push(municipio);
  if (!whatsapp) semCelular.push(municipio);

  // 1 linha por e-mail: o presidente costuma ter o institucional da Câmara +
  // o pessoal. Todos recebem; o 1º é o "principal" (leva o WhatsApp junto).
  emails.forEach((email, i) => {
    if (seenEmail.has(email)) return; // e-mail repetido entre municípios
    seenEmail.add(email);
    out.push({
      email,
      name: presidente,
      whatsapp: i === 0 ? whatsapp : null,
      phone: i === 0 ? whatsapp : null,
      municipio,
      uf: 'SP',
      ibge,
      role: 'presidente_camara',
      isPrimary: i === 0,
      attributes: {
        presidente,
        primeiro_nome: firstName(presidente),
        camara: `Câmara Municipal de ${municipio}`,
        origem: 'apm-presidentes-camaras',
        tags: ['impositivas-sp'],
      },
    });
  });
}

const primarios = out.filter((c) => c.isPrimary);
fs.writeFileSync(path.join(__dirname, 'contacts.json'), JSON.stringify(out, null, 2));

console.log(`linhas na planilha ........ ${rows.length}`);
console.log(`municípios (1 principal) .. ${primarios.length}`);
console.log(`contatos totais (e-mails) . ${out.length}`);
console.log(`com WhatsApp .............. ${primarios.filter((c) => c.whatsapp).length}`);
console.log(`com IBGE .................. ${primarios.filter((c) => c.ibge).length}`);
if (semIbge.length) console.log(`sem IBGE (${semIbge.length}): ${semIbge.slice(0, 12).join(', ')}${semIbge.length > 12 ? '…' : ''}`);
console.log(`→ scripts/impositivas/contacts.json`);
