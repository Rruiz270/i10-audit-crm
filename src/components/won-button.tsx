'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { changeStage } from '@/lib/actions/opportunities';
import { PRODUCTS, PRODUCT_POSVENDA, type Product } from '@/lib/products';

// Botão "✓ Marcar como Ganhou" + popup de produto(s) — layout do mockup:
// grade 2 colunas de cards selecionáveis + painel "o que acontece ao confirmar".
export function WonButton({
  opportunityId,
  municipality,
  currentProducts,
}: {
  opportunityId: number;
  municipality: string;
  currentProducts?: string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState<string[]>(currentProducts?.length ? currentProducts : []);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function confirm() {
    if (!sel.length) return;
    setBusy(true);
    setErr(null);
    const res = await changeStage({ opportunityId, toStage: 'ganhou', products: sel });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? 'Falha ao registrar o ganho');
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-500"
      >
        ✓ Marcar como Ganhou
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/55 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mt-10 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold" style={{ color: 'var(--i10-navy)' }}>
                  🎉 {municipality} — Ganhou!
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Quais produtos fecharam? <b>Obrigatório</b> — cada produto dispara o pós-venda
                  certo.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PRODUCTS.map((p, i) => {
                const on = sel.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 text-sm transition ${
                      on ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-cyan-300'
                    } ${i === PRODUCTS.length - 1 ? 'sm:col-span-2' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setSel((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">{p}</span>
                      <span className="block text-xs leading-snug text-slate-500">
                        {PRODUCT_POSVENDA[p as Product]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                O que acontece ao confirmar
              </div>
              <div className="mt-2 space-y-1.5">
                {sel.length === 0 ? (
                  <p className="text-xs text-rose-600">
                    Selecione ao menos um produto — sem produto o ganho não confirma.
                  </p>
                ) : (
                  sel.map((p) => (
                    <div key={p} className="flex gap-2.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-i10-700 text-white">
                        ⚡
                      </span>
                      <span>
                        <b>{p}:</b> {PRODUCT_POSVENDA[p as Product]}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {err && <p className="mt-3 text-xs font-semibold text-rose-600">{err}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirm}
                disabled={!sel.length || busy}
                className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Registrando…' : 'Confirmar ganho ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
