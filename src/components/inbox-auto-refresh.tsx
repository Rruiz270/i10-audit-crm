'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Auto-refresh do inbox — re-renderiza a rota (server component) num intervalo,
// trazendo mensagens novas sem o usuário recarregar. Leve: usa router.refresh()
// (re-fetch do RSC), não websockets. Pausa quando a aba não está visível.
export function InboxAutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
