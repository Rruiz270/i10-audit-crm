'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/schema-marketing';
import { requireUser } from '@/lib/session';
import { sendPushToUsers } from '@/lib/push';

// Salva (upsert por endpoint) a assinatura de push do dispositivo do usuário.
export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!input?.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false as const, error: 'assinatura inválida' };
  }
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  return { ok: true as const };
}

// Remove a assinatura (ao desativar as notificações no dispositivo).
export async function removePushSubscription(endpoint: string): Promise<{ ok: true }> {
  await requireUser();
  if (endpoint) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  return { ok: true as const };
}

// Envia um push de teste para o próprio usuário (botão "testar" no app).
export async function sendTestPushToSelf(): Promise<{ ok: boolean; sent: number }> {
  const user = await requireUser();
  const sent = await sendPushToUsers([user.id], {
    title: 'i10 Atende ✅',
    body: 'Notificações ativadas! Você será avisado quando chegar mensagem.',
    url: '/atende',
    tag: 'atende-test',
  });
  return { ok: sent > 0, sent };
}
