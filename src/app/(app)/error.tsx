'use client'; // Error boundaries precisam ser Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

/**
 * Error boundary do grupo (app) — cobre todas as rotas internas.
 * Erros típicos aqui são falhas transitórias de rede/Neon, então o
 * unstable_retry (re-fetch + re-render do segmento) costuma resolver.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-8 py-8">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <Icon name="alert-triangle" size={24} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--i10-navy)' }}>
          Algo deu errado
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Não foi possível carregar esta página. Pode ser uma instabilidade
          momentânea de conexão — tente novamente.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] text-slate-400">Código: {error.digest}</p>
        )}
        <Button variant="accent" className="mt-5" onClick={() => unstable_retry()}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
