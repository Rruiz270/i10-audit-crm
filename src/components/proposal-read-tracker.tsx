'use client';

import { useEffect, useRef } from 'react';

// Mede quanto tempo o cliente fica com a proposta pública visível e reporta
// para /api/proposta/track (acumulado por sessão de navegação). Pings a cada
// 20s enquanto a aba está visível + beacon final no pagehide — assim o
// "momento de interesse" dispara ainda durante a leitura, não só na saída.

const PING_MS = 20_000;

export function ProposalReadTracker({
  proposalId,
  token,
}: {
  proposalId: number;
  token: string;
}) {
  const visibleMs = useRef(0);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    const sessionKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const elapsedSeconds = () => {
      const live = visibleSince.current ? Date.now() - visibleSince.current : 0;
      return Math.round((visibleMs.current + live) / 1000);
    };

    const send = (useBeacon: boolean) => {
      const seconds = elapsedSeconds();
      if (seconds < 3) return;
      const payload = JSON.stringify({ proposalId, token, sessionKey, seconds });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/proposta/track', payload);
      } else {
        fetch('/api/proposta/track', {
          method: 'POST',
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibleSince.current = Date.now();
      } else {
        if (visibleSince.current) {
          visibleMs.current += Date.now() - visibleSince.current;
          visibleSince.current = null;
        }
        send(true);
      }
    };

    if (document.visibilityState === 'visible') visibleSince.current = Date.now();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') send(false);
    }, PING_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', () => send(true));

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [proposalId, token]);

  return null;
}
