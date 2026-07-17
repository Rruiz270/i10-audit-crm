'use client';

import { useEffect, useState } from 'react';
import { savePushSubscription, sendTestPushToSelf } from '@/lib/actions/marketing/push';

// Converte a chave VAPID pública (base64url) para o formato exigido pelo
// pushManager.subscribe (Uint8Array).
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = 'checking' | 'unsupported' | 'need-install' | 'prompt' | 'granted' | 'denied' | 'busy';

// Registra (ou reaproveita) a assinatura de push e salva no servidor.
async function subscribeAndSave(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!existing && !key) return false;
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key!) as BufferSource,
      }));
    const j = sub.toJSON();
    const r = await savePushSubscription({
      endpoint: j.endpoint!,
      keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth },
      userAgent: navigator.userAgent,
    });
    return 'ok' in r && r.ok;
  } catch {
    return false;
  }
}

export function PushControls() {
  const [state, setState] = useState<State>('checking');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // sai do corpo síncrono do efeito
      if (cancelled) return;
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      const supported =
        'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!supported) {
        setState(standalone ? 'unsupported' : 'need-install');
        return;
      }
      if (Notification.permission === 'granted') {
        await subscribeAndSave();
        if (!cancelled) setState('granted');
      } else if (Notification.permission === 'denied') {
        setState('denied');
      } else {
        setState('prompt');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState('busy');
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'prompt');
        return;
      }
      const ok = await subscribeAndSave();
      if (!ok) {
        setState('prompt');
        setMsg('Não consegui registrar. Tente de novo.');
        return;
      }
      setState('granted');
      await sendTestPushToSelf().catch(() => {});
    } catch {
      setState('prompt');
      setMsg('Falha ao ativar. Tente de novo.');
    }
  }

  if (state === 'checking' || state === 'granted' || state === 'unsupported') return null;

  if (state === 'need-install') {
    return (
      <div className="atd-push-banner install">
        🔔 Para receber avisos de mensagem, <b>instale o app</b> (Compartilhar → Adicionar à Tela de Início) e abra por ele.
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="atd-push-banner denied">
        🔕 Notificações bloqueadas. Ative em <b>Ajustes → Notificações → i10 Atende</b>.
      </div>
    );
  }
  return (
    <div className="atd-push-banner">
      <span>🔔 Receba um aviso no celular quando chegar mensagem</span>
      <button onClick={enable} disabled={state === 'busy'}>
        {state === 'busy' ? '…' : 'Ativar'}
      </button>
      {msg && <em>{msg}</em>}
    </div>
  );
}
