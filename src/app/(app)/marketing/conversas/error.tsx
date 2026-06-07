'use client';

import { useEffect } from 'react';

/**
 * Boundary de erro da rota de Conversas. Em vez do "Server Components render
 * error" cru, mostra um fallback limpo com retry. Loga no console do navegador
 * (com digest) pra diagnóstico.
 */
export default function ConversasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[conversas] erro de render:', error, 'digest:', error.digest);
  }, [error]);

  return (
    <div className="grid h-[calc(100vh-0px)] place-items-center bg-slate-50 p-8">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Não foi possível carregar o inbox</div>
        <p className="mt-1 text-xs text-slate-500">
          Houve um erro temporário ao carregar esta conversa. Tente novamente.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] text-slate-400">ref: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--i10-navy)' }}
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
