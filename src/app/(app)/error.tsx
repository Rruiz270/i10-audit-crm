'use client';

import { useEffect } from 'react';

/**
 * Rede de segurança do app autenticado: erros não tratados em qualquer rota
 * (render, actions que ainda lançam) caem aqui em vez do stack trace cru.
 * `unstable_retry` re-busca e re-renderiza o segmento (Next 16.2+).
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[app] erro de render:', error, 'digest:', error.digest);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center bg-slate-50 p-8">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Algo deu errado</div>
        <p className="mt-1 text-xs text-slate-500">
          Houve um erro inesperado ao carregar esta página. Seus dados não foram perdidos — tente novamente.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] text-slate-400">ref: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-4 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--i10-navy)' }}
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
