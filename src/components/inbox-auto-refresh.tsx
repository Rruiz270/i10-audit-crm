'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Auto-refresh do inbox — em vez de re-renderizar a rota (RSC) cegamente a
// cada tick, consulta um endpoint delta leve (/api/marketing/conversations/
// latest, que devolve só o max(last_message_at) visível) e só chama
// router.refresh() quando o valor mudou. Corta invocações/compute quando não
// há mensagem nova e mantém a latência percebida do chat. Pausa quando a aba
// não está visível. `conversationId` restringe o delta a uma conversa (chat).
export function InboxAutoRefresh({
  intervalMs = 8000,
  conversationId,
}: {
  intervalMs?: number;
  conversationId?: number;
}) {
  const router = useRouter();
  // Último token visto ('' = escopo vazio). null = ainda sem baseline — o
  // primeiro tick só registra o valor, sem refresh (a página acabou de vir
  // fresca do servidor).
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    lastSeen.current = null;
    let stopped = false;
    let inFlight = false;

    const tick = async () => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try {
        const qs = conversationId != null ? `?conversationId=${conversationId}` : '';
        const res = await fetch(`/api/marketing/conversations/latest${qs}`, {
          cache: 'no-store',
        });
        if (!res.ok || stopped) return;
        const { latest } = (await res.json()) as { latest: string | null };
        const token = latest ?? '';
        if (stopped) return;
        if (lastSeen.current === null) {
          lastSeen.current = token;
        } else if (token !== lastSeen.current) {
          lastSeen.current = token;
          router.refresh();
        }
      } catch {
        // Offline/transiente — tenta de novo no próximo tick.
      } finally {
        inFlight = false;
      }
    };

    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [router, intervalMs, conversationId]);
  return null;
}
