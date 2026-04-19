'use client';

import * as React from 'react';

/**
 * Registra o service worker + oferece botão "instalar" quando o browser
 * expõe `beforeinstallprompt`. Também pede permissão de notificação depois
 * que o usuário interage pela primeira vez.
 */
export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = React.useState<{
    prompt: () => Promise<void>;
  } | null>(null);
  // Mounted guard pra evitar hydration mismatch — server renderiza null,
  // client só habilita depois do primeiro useEffect.
  const [mounted, setMounted] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted guard necessário contra hydration mismatch
    setMounted(true);
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW register falhou:', err));
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  if (!mounted || installed || !installPrompt) return null;

  return (
    <button
      onClick={async () => {
        await installPrompt.prompt();
        setInstallPrompt(null);
      }}
      className="fixed bottom-6 left-6 z-40 rounded-full shadow-lg px-4 py-2.5 text-sm font-semibold text-white flex items-center gap-2"
      style={{ background: 'var(--i10-gradient-accent)' }}
    >
      <span>📱</span>
      Instalar no celular
    </button>
  );
}

/**
 * Pede permissão de notificação (e dispara uma notificação local sempre que
 * solicitado via `notifyLocal`). Usar em cliente pra alertas de task overdue,
 * novo relatório BNCC, etc.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported' as const;
  if (Notification.permission === 'granted') return 'granted' as const;
  if (Notification.permission === 'denied') return 'denied' as const;
  const r = await Notification.requestPermission();
  return r;
}

export async function notifyLocal(title: string, body: string, url?: string) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: url ?? '/' },
  });
}
