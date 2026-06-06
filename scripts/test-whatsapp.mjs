// scripts/test-whatsapp.mjs
// Smoke test do envio de WhatsApp via Twilio (sandbox ou produção).
// Espelha a chamada que TwilioWhatsAppProvider.send() faz, e respeita a
// trava MARKETING_TEST_ALLOWLIST_PHONE — não envia pra número fora da lista.
//
// Uso:
//   node scripts/test-whatsapp.mjs +5511999999999 "mensagem opcional"
//
// Pré-requisitos:
//   1. .env.local com TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
//   2. MARKETING_TEST_ALLOWLIST_PHONE contendo o número de destino
//   3. (Sandbox) o destino já mandou "join <palavra>" pro número sandbox

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const [, , rawTo, ...msgParts] = process.argv;

if (!rawTo) {
  console.error('❌ Uso: node scripts/test-whatsapp.mjs +5511999999999 "mensagem"');
  process.exit(1);
}

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

if (!SID || !TOKEN) {
  console.error('❌ TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN ausentes no .env.local');
  process.exit(1);
}

// Normaliza E.164 → whatsapp:+E164 (mesma lógica do provider)
const digits = rawTo.startsWith('+') ? rawTo : '+' + rawTo.replace(/\D/g, '');
const toWa = `whatsapp:${digits}`;

// Trava de segurança — mesma semântica do MARKETING_TEST_ALLOWLIST_PHONE no pipeline
const allow = (process.env.MARKETING_TEST_ALLOWLIST_PHONE ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\D/g, ''))
  .filter(Boolean);

if (allow.length === 0) {
  console.error('❌ MARKETING_TEST_ALLOWLIST_PHONE vazio — preencha com seu número antes de testar.');
  process.exit(1);
}
if (!allow.includes(digits.replace(/\D/g, ''))) {
  console.error(`❌ ${digits} não está na allowlist (${allow.join(', ')}). Bloqueado pela trava de segurança.`);
  process.exit(1);
}

const body =
  msgParts.join(' ') ||
  '✅ Teste i10 CRM → Twilio WhatsApp. Se você recebeu isto, o pipeline de envio está funcionando.';

console.log('📤 Enviando…');
console.log('   from:', FROM);
console.log('   to:  ', toWa);
console.log('   body:', body);

const twilioMod = await import('twilio');
const twilioFactory = twilioMod.default ?? twilioMod;
const client = twilioFactory(SID, TOKEN);

try {
  const message = await client.messages.create({ from: FROM, to: toWa, body });
  console.log('\n✅ Aceito pelo Twilio.');
  console.log('   SID:   ', message.sid);
  console.log('   status:', message.status);
  console.log('\nObserve o status mudar (queued → sent → delivered → read).');
  console.log('Em dev local o webhook de status não volta (localhost), mas a entrega no celular confirma o caminho.');
} catch (err) {
  console.error('\n❌ Erro do Twilio:');
  console.error('   code:   ', err.code);
  console.error('   message:', err.message);
  if (err.code === 63015 || /sandbox/i.test(err.message ?? '') || err.code === 21408) {
    console.error('\n💡 Provável causa: o número de destino não fez "join <palavra>" no sandbox,');
    console.error('   ou a janela de 24h expirou. Reenvie o join e tente de novo.');
  }
  process.exit(1);
}
