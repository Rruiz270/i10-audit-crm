'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshTemplateStatus } from '@/lib/actions/marketing/whatsapp-templates';

// Botão "Atualizar status" — re-checa a aprovação Meta de um ContentSid
// ignorando o cache TTL e revalida a lista.
export function TemplateStatusRefresh({ contentSid }: { contentSid: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshTemplateStatus(contentSid);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? 'Atualizando…' : 'Atualizar status'}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
