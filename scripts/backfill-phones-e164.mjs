// Backfill: normaliza telefones BR para E.164 em marketing.contacts e
// crm.contacts, e preenche whatsapp a partir de phone quando for celular.
// Uso:  node scripts/backfill-phones-e164.mjs         (dry-run)
//       node scripts/backfill-phones-e164.mjs --apply
import { neon } from '@neondatabase/serverless';

const APPLY = process.argv.includes('--apply');
const sql = neon(process.env.DATABASE_URL);

function normalizeBrPhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let d = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !d.startsWith('55')) return d.length >= 8 ? `+${d}` : null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}
const isBrMobile = (e) => e && e.replace(/\D/g, '').length === 13 && e[5] === '9' && e.startsWith('+55');

async function processTable(table) {
  const rows = await sql.query(`SELECT id, phone, whatsapp FROM ${table} WHERE phone IS NOT NULL OR whatsapp IS NOT NULL`);
  let phoneFix = 0, waFill = 0, waFix = 0, skip = 0;
  for (const r of rows) {
    const pNorm = normalizeBrPhone(r.phone);
    const wNorm = normalizeBrPhone(r.whatsapp);
    const newPhone = pNorm ?? r.phone;
    // whatsapp: normalizado se existia; senão herda phone quando celular
    let newWa = wNorm ?? r.whatsapp ?? null;
    if (!newWa && isBrMobile(pNorm)) newWa = pNorm;
    const changed = newPhone !== r.phone || newWa !== r.whatsapp;
    if (!changed) { skip++; continue; }
    if (newPhone !== r.phone) phoneFix++;
    if (!r.whatsapp && newWa) waFill++;
    else if (r.whatsapp && newWa !== r.whatsapp) waFix++;
    if (APPLY) {
      await sql.query(`UPDATE ${table} SET phone = $1, whatsapp = $2 WHERE id = $3`, [newPhone, newWa, r.id]);
    }
  }
  console.log(`${table}: ${rows.length} com telefone | phone normalizado: ${phoneFix} | whatsapp preenchido: ${waFill} | whatsapp normalizado: ${waFix} | sem mudança: ${skip} ${APPLY ? '(APLICADO)' : '(dry-run)'}`);
}

await processTable('marketing.contacts');
await processTable('crm.contacts');
console.log(APPLY ? 'Backfill aplicado.' : 'Dry-run — rode com --apply para gravar.');
