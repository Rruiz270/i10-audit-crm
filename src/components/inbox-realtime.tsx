'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Entrega em tempo real do inbox — substitui o antigo InboxAutoRefresh (polling
// de router.refresh() a cada 6–8s). Abre UM stream SSE (/api/atende/stream) e
// só chama router.refresh() quando o servidor sinaliza que algo mudou (delta),
// eliminando re-renders RSC em vão. Fecha o stream quando a aba fica oculta
// (economiza função serverless) e, ao voltar, reconecta + refresh. Se o stream
// cair de vez (ex.: deploy, 401), degrada para polling em fallbackIntervalMs
// e tenta reabrir o stream periodicamente.
export function InboxRealtime({
  conversationId,
  includeList = true,
  fallbackIntervalMs = 15000,
}: {
  conversationId?: number;
  includeList?: boolean;
  fallbackIntervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams();
    if (includeList) params.set('list', '1');
    if (conversationId != null) params.set('c', String(conversationId));
    const url = `/api/atende/stream?${params.toString()}`;

    let es: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let hadOpen = false;

    const stopFallback = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const startFallback = () => {
      if (fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        if (document.visibilityState === 'visible') router.refresh();
      }, fallbackIntervalMs);
    };

    const connect = () => {
      if (disposed || es) return;
      es = new EventSource(url);
      es.onopen = () => {
        stopFallback();
        // Reconexão (deploy, aba voltou do background): pode ter perdido
        // eventos enquanto desconectado — um refresh recupera o estado.
        if (hadOpen) router.refresh();
        hadOpen = true;
      };
      es.addEventListener('change', () => router.refresh());
      es.onerror = () => {
        // Em CONNECTING o EventSource re-tenta sozinho (respeitando `retry:`).
        // CLOSED = falha fatal (401/404/redirect) → polling + retry espaçado.
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          if (document.visibilityState === 'visible') startFallback();
          reconnectTimer = setTimeout(connect, 30000);
        }
      };
    };

    // Aba oculta: derruba stream e fallback (mesmo comportamento de "pausa" do
    // polling antigo, mas agora também libera a função serverless no servidor).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        connect();
      } else {
        es?.close();
        es = null;
        stopFallback();
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      es?.close();
      es = null;
      stopFallback();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [router, conversationId, includeList, fallbackIntervalMs]);

  return null;
}
