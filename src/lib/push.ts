import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { pushSubscriptions } from './schema-marketing';

// Web Push (VAPID) para o app /atende. Server-only. Config lazy: se as chaves
// VAPID não estiverem no ambiente, as funções viram no-op (não quebram o fluxo
// de inbound). Assinaturas mortas (404/410) são removidas do banco.

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:i10@i10.org.br', pub, priv);
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

// Dispara um push para todas as assinaturas dos usuários informados.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!ensureConfigured() || userIds.length === 0) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return 0;

  const data = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 = assinatura expirada/removida no dispositivo → limpa.
        if (code === 404 || code === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).catch(() => {});
        }
      }
    }),
  );
  return sent;
}

// IDs de todos os usuários com ao menos uma assinatura (para conversa sem dono).
export async function getAllSubscribedUserIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  return rows.map((r) => r.userId);
}
