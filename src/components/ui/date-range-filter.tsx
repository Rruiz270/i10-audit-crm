import Link from 'next/link';

// Filtro por período de entrada do lead. Server component puro: os campos
// vivem na URL, então o filtro sobrevive a recarregar a página, dá para
// compartilhar o link e não precisa de estado no cliente.
//
// A data usada é `lead_entrada_at` — quando outro contato da mesma cidade
// engaja, ela avança, então a cidade sempre aparece pela última vez que deu
// sinal.

type Atalho = { label: string; dias: number | null };

const ATALHOS: Atalho[] = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
  { label: 'Tudo', dias: null },
];

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DateRangeFilter({
  desde,
  ate,
  basePath,
  outros = {},
}: {
  desde?: string;
  ate?: string;
  basePath: string;
  /** Demais filtros da tela, preservados ao trocar o período. */
  outros?: Record<string, string | undefined>;
}) {
  const href = (d?: string, a?: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(outros)) if (v) q.set(k, v);
    if (d) q.set('desde', d);
    if (a) q.set('ate', a);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const hoje = new Date();
  const ativo = (dias: number | null) => {
    if (dias === null) return !desde && !ate;
    const alvo = new Date(hoje);
    alvo.setDate(alvo.getDate() - dias);
    return desde === isoDia(alvo) && !ate;
  };

  return (
    <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
      {Object.entries(outros).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="desde" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Entrada de
        </label>
        <input
          id="desde"
          name="desde"
          type="date"
          defaultValue={desde ?? ''}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ate" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          até
        </label>
        <input
          id="ate"
          name="ate"
          type="date"
          defaultValue={ate ?? ''}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Filtrar
      </button>
      <div className="flex flex-wrap gap-1.5">
        {ATALHOS.map((a) => {
          const alvo = new Date(hoje);
          if (a.dias !== null) alvo.setDate(alvo.getDate() - a.dias);
          return (
            <Link
              key={a.label}
              href={a.dias === null ? href(undefined, undefined) : href(isoDia(alvo), undefined)}
              className={
                'rounded-full px-3 py-1 text-xs font-semibold ' +
                (ativo(a.dias)
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
              }
            >
              {a.label}
            </Link>
          );
        })}
      </div>
    </form>
  );
}
