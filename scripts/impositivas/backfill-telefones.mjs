// Completa telefone e WhatsApp dos contatos do pipeline a partir da base de
// marketing. Idempotente — serve tanto para o backfill inicial quanto para
// pegar contatos criados antes de um deploy corrigido chegar em produção.
//
//   node scripts/impositivas/backfill-telefones.mjs [source]
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));
const SOURCE = process.argv[2] ?? 'lp_impositivas-sp';

// Mesmas regras de src/lib/phone-utils.ts (o script não importa TS).
const norm = (raw) => {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? `+55${d}` : null;
};
const movel = (e164) => {
  if (!e164) return false;
  const d = e164.replace(/\D/g, '');
  return d.startsWith('55') && d.length === 13 && d[4] === '9';
};

const alvos = await sql`
  SELECT cc.id, cc.email, cc.phone, cc.whatsapp, m.codigo_ibge
  FROM crm.contacts cc
  JOIN crm.opportunities o ON o.id = cc.opportunity_id
  LEFT JOIN fundeb.municipalities m ON m.id = o.municipality_id
  WHERE o.source = ${SOURCE} AND (cc.phone IS NULL OR cc.whatsapp IS NULL)`;

let preenchidos = 0;
const semNumero = [];
for (const c of alvos) {
  // 1) número do próprio contato; 2) qualquer contato da mesma câmara.
  const proprio = await sql`
    SELECT whatsapp, phone FROM marketing.contacts WHERE lower(email) = ${c.email.toLowerCase()} LIMIT 1`;
  let fone = norm(proprio[0]?.whatsapp ?? proprio[0]?.phone);
  if (!fone && c.codigo_ibge) {
    const camara = await sql`
      SELECT whatsapp, phone FROM marketing.contacts
      WHERE ibge = ${c.codigo_ibge} AND COALESCE(whatsapp, phone) IS NOT NULL
      ORDER BY (whatsapp IS NULL), id LIMIT 1`;
    fone = norm(camara[0]?.whatsapp ?? camara[0]?.phone);
  }
  if (!fone) {
    semNumero.push(c.email);
    continue;
  }
  await sql`
    UPDATE crm.contacts SET phone = ${fone}, whatsapp = ${movel(fone) ? fone : null}
    WHERE id = ${c.id}`;
  preenchidos += 1;
}

const fim = await sql`
  SELECT count(*)::int total, count(phone)::int com_telefone, count(whatsapp)::int com_whatsapp
  FROM crm.contacts cc JOIN crm.opportunities o ON o.id = cc.opportunity_id
  WHERE o.source = ${SOURCE}`;

console.log(`analisados ${alvos.length} · preenchidos ${preenchidos} · sem número em lugar nenhum ${semNumero.length}`);
if (semNumero.length) console.log('  ', semNumero.slice(0, 8).join(', '));
console.log(`total ${fim[0].total} · com telefone ${fim[0].com_telefone} · com WhatsApp ${fim[0].com_whatsapp}`);
console.log('(quem fica sem WhatsApp tem só telefone fixo na base — fixo no campo do zap dá erro no envio)');
