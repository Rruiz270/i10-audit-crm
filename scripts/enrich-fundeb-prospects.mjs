// Enriquecimento de prospecção FUNDEB — importa dados públicos (FNDE/SIOPE)
// para crm.municipality_prospecting, casando com fundeb.municipalities por
// código IBGE (fallback: nome+UF sem acento).
//
// Fontes dos arquivos (baixar CSV/planilha e converter p/ CSV se preciso):
//   · Complementações VAAT/VAAR: portarias e planilhas em fnde.gov.br
//     (Financiamento → FUNDEB → Dados estatísticos / portarias de ajuste)
//   · Receita FUNDEB: SIOPE (fnde.gov.br/siope) — relatórios municipais
//   · Matrículas: Censo Escolar (INEP) ou matrículas ponderadas do FNDE
//   · IDEB: INEP (ideb.inep.gov.br) — anos iniciais da rede municipal
//
// Uso:
//   node scripts/enrich-fundeb-prospects.mjs dados.csv [--ano 2025] [--fonte "fnde-vaat-2025"]
//
// Colunas reconhecidas no header (case-insensitive; separador , ou ;):
//   codigo_ibge | ibge | cod_ibge      código IBGE do município (7 dígitos)
//   municipio | nome                   nome (fallback quando não há IBGE)
//   uf                                 sigla UF (usada no fallback por nome)
//   matriculas                         matrículas da rede municipal
//   receita_fundeb | receita           receita anual FUNDEB em R$
//   vaat | complementacao_vaat         complementação VAAT anual em R$
//   vaar | complementacao_vaar         complementação VAAR anual em R$
//   ideb | ideb_anos_iniciais           IDEB anos iniciais da rede (INEP, 0–10)
//   ano | ano_referencia | exercicio   ano de referência (senão usa --ano)
//
// Números aceitam formato BR ("1.234.567,89") ou US ("1234567.89").
// Campos ausentes ficam null e NÃO sobrescrevem valor existente (COALESCE).

import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const defaultAno = flag('ano') ? Number(flag('ano')) : null;

if (!file) {
  console.error('Uso: node scripts/enrich-fundeb-prospects.mjs <arquivo.csv> [--ano 2025] [--fonte "..."]');
  process.exit(1);
}
const fonte = flag('fonte') ?? path.basename(file);

// ── CSV parsing (separador ; ou , · aspas duplas) ──────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const sep = text.split('\n', 1)[0].includes(';') ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const normKey = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const ALIASES = {
  codigoIbge: ['codigo_ibge', 'cod_ibge', 'ibge', 'codigo_municipio', 'cod_mun', 'co_municipio'],
  nome: ['municipio', 'nome', 'nome_municipio', 'no_municipio'],
  uf: ['uf', 'sigla_uf', 'sg_uf', 'estado'],
  matriculas: ['matriculas', 'matriculas_ponderadas', 'total_matriculas', 'qt_matriculas'],
  receitaFundeb: ['receita_fundeb', 'receita_total_fundeb', 'receita', 'vl_receita_fundeb'],
  vaat: ['vaat', 'complementacao_vaat', 'vl_vaat'],
  vaar: ['vaar', 'complementacao_vaar', 'vl_vaar'],
  ideb: ['ideb', 'ideb_anos_iniciais', 'ideb_ai', 'nota_ideb'],
  ano: ['ano', 'ano_referencia', 'exercicio'],
};

function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/R\$|\s/g, '').trim();
  if (!s || s === '-') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
const [header, ...dataRows] = parseCsv(text);
if (!header || dataRows.length === 0) {
  console.error('CSV vazio ou sem linhas de dados.');
  process.exit(1);
}

const headerKeys = header.map(normKey);
const colOf = (field) => {
  for (const alias of ALIASES[field]) {
    const idx = headerKeys.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
};
const cols = Object.fromEntries(Object.keys(ALIASES).map((f) => [f, colOf(f)]));
if (cols.codigoIbge < 0 && cols.nome < 0) {
  console.error(`Header sem coluna de código IBGE nem de nome. Colunas vistas: ${headerKeys.join(', ')}`);
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const municipalities = await sql`SELECT id, nome, uf, codigo_ibge FROM fundeb.municipalities`;
const byIbge = new Map(municipalities.filter((m) => m.codigo_ibge).map((m) => [String(m.codigo_ibge), m.id]));
const byNomeUf = new Map(municipalities.map((m) => [`${normName(m.nome)}|${(m.uf ?? '').toUpperCase()}`, m.id]));

let upserted = 0;
const unmatched = [];

for (const row of dataRows) {
  const get = (field) => (cols[field] >= 0 ? String(row[cols[field]] ?? '').trim() : '');

  let municipalityId = null;
  const ibge = get('codigoIbge').replace(/\D/g, '');
  if (ibge) municipalityId = byIbge.get(ibge) ?? byIbge.get(ibge.padStart(7, '0')) ?? null;
  if (!municipalityId && get('nome')) {
    municipalityId = byNomeUf.get(`${normName(get('nome'))}|${get('uf').toUpperCase()}`) ?? null;
  }
  if (!municipalityId) {
    unmatched.push(get('nome') || ibge || '(linha sem identificação)');
    continue;
  }

  const matriculas = parseNumber(get('matriculas'));
  const receita = parseNumber(get('receitaFundeb'));
  const vaat = parseNumber(get('vaat'));
  const vaar = parseNumber(get('vaar'));
  const ideb = parseNumber(get('ideb'));
  const ano = parseNumber(get('ano')) ?? defaultAno;

  await sql`
    INSERT INTO crm.municipality_prospecting
      (municipality_id, ano_referencia, matriculas, receita_fundeb,
       complementacao_vaat, complementacao_vaar, ideb, fonte, updated_at)
    VALUES (${municipalityId}, ${ano}, ${matriculas}, ${receita}, ${vaat}, ${vaar}, ${ideb}, ${fonte}, now())
    ON CONFLICT (municipality_id) DO UPDATE SET
      ano_referencia      = COALESCE(EXCLUDED.ano_referencia, crm.municipality_prospecting.ano_referencia),
      matriculas          = COALESCE(EXCLUDED.matriculas, crm.municipality_prospecting.matriculas),
      receita_fundeb      = COALESCE(EXCLUDED.receita_fundeb, crm.municipality_prospecting.receita_fundeb),
      complementacao_vaat = COALESCE(EXCLUDED.complementacao_vaat, crm.municipality_prospecting.complementacao_vaat),
      complementacao_vaar = COALESCE(EXCLUDED.complementacao_vaar, crm.municipality_prospecting.complementacao_vaar),
      ideb                = COALESCE(EXCLUDED.ideb, crm.municipality_prospecting.ideb),
      fonte               = EXCLUDED.fonte,
      updated_at          = now()`;
  upserted++;
}

console.log(`✓ ${upserted} municípios enriquecidos (fonte: ${fonte})`);
if (unmatched.length) {
  console.log(`⚠ ${unmatched.length} linhas sem match na base fundeb.municipalities:`);
  for (const u of unmatched.slice(0, 20)) console.log(`  - ${u}`);
  if (unmatched.length > 20) console.log(`  … e mais ${unmatched.length - 20}`);
}
