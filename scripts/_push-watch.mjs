import { config } from 'dotenv';
config({ path: '.env.local' });
const { neon } = await import('@neondatabase/serverless');
const webpush = (await import('web-push')).default;
const sql = neon(process.env.DATABASE_URL);
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:i10@i10.org.br',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

async function pickConv() {
  const r = await sql`
    SELECT c.id, c.contact_name, c.wa_phone,
      (SELECT body FROM marketing.messages m
        WHERE m.conversation_id = c.id AND m.direction='inbound' AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 1) AS last_in
    FROM marketing.conversations c
    WHERE c.contact_name IS NOT NULL
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 1`;
  return r[0] ?? null;
}

console.log('👀 vigia de push iniciado — aguardando você ativar no celular…');
const sent = new Set();
let done = false;
for (let i = 0; i < 100 && !done; i++) {
  const subs = await sql`SELECT id, endpoint, p256dh, auth, user_agent FROM marketing.push_subscriptions`;
  const fresh = subs.filter((s) => !sent.has(s.id));
  if (fresh.length) {
    const conv = await pickConv();
    const title = conv?.contact_name || 'Nova mensagem — i10 Atende';
    const bodyRaw = conv?.last_in || 'Olá! Gostaria de saber mais sobre o FUNDEB.';
    const body = String(bodyRaw).slice(0, 120);
    const payload = JSON.stringify({
      title,
      body,
      url: conv ? `/atende/c/${conv.id}` : '/atende',
      tag: 'atende-realtest',
    });
    for (const s of fresh) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        console.log(`✅ PUSH ENVIADO → sub#${s.id} · "${title}: ${body}"`);
      } catch (e) {
        console.log(`⚠️ falha sub#${s.id}:`, e.statusCode || e.message);
      }
      sent.add(s.id);
    }
    done = true;
  }
  if (!done) await new Promise((r) => setTimeout(r, 15000));
}
if (sent.size === 0) {
  console.log('⏱️ TIMEOUT (~25min): nenhuma assinatura apareceu. Ative no celular e me avise.');
} else {
  console.log('🏁 teste concluído. Você deve ter recebido o push no celular.');
}
