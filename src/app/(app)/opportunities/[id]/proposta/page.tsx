import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpportunity } from '@/lib/actions/opportunities';
import { createProposal } from '@/lib/actions/proposals';
import { requireUser } from '@/lib/session';
import { PRODUCTS, PRODUCT_POSVENDA, type Product } from '@/lib/products';

export const dynamic = 'force-dynamic';

// ─── Gerador de proposta NATIVO do CRM ──────────────────────────────────────
// Sem senha, sem app externo: os dados vêm do card (município, gestor, rep).
// Selecione produtos + valores → gera a proposta (P-XXXX vN) e abre a versão
// imprimível com o brandbook i10 (Cmd+P → PDF).

// Valores de referência por produto (editáveis no form).
const DEFAULT_VALUES: Record<string, number> = {
  'Acelerador FUNDEB': 49900,
  'Ensino Integral': 48000,
  'Escola Online': 12400,
  'Município Bilíngue': 86000,
  'Radar Fiscal 360': 2399,
};

export default async function PropostaBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const op = await getOpportunity(Number(id));
  if (!op) notFound();

  const primary = op.contacts.find((c) => c.isPrimary) ?? op.contacts[0];

  return (
    <div className="max-w-3xl px-8 py-8">
      <Link href={`/opportunities/${op.id}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {op.municipalityName ?? `Oportunidade #${op.id}`}
      </Link>
      <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
        📄 Nova proposta{' '}
        <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          gerada no CRM
        </span>
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Dados puxados do card — selecione os produtos, ajuste os valores e gere. A proposta abre
        pronta para imprimir/salvar em PDF.
      </p>

      {/* Dados do card (somente leitura) */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Município</div>
          <div className="font-semibold text-slate-800">{op.municipalityName ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gestor(a)</div>
          <div className="font-semibold text-slate-800">{primary?.name ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cargo</div>
          <div className="font-semibold text-slate-800">{primary?.role ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Representante</div>
          <div className="font-semibold text-slate-800">{op.ownerName ?? '—'}</div>
        </div>
      </div>

      <form action={createProposal} className="mt-5 space-y-4">
        <input type="hidden" name="opportunityId" value={op.id} />
        <input type="hidden" name="goPrint" value="1" />

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-slate-900">Produtos e valores</h2>
          <p className="mb-4 text-xs text-slate-500">
            Marque os produtos da proposta e ajuste o valor mensal de cada um.
          </p>
          <div className="space-y-2.5">
            {PRODUCTS.map((prod) => (
              <label
                key={prod}
                className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-slate-200 p-3 transition has-checked:border-emerald-400 has-checked:bg-emerald-50"
              >
                <input type="checkbox" name="products" value={prod} className="accent-emerald-600" />
                <span className="min-w-40 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{prod}</span>
                  <span className="block text-xs leading-snug text-slate-500">
                    {PRODUCT_POSVENDA[prod as Product]}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-slate-400">R$/mês</span>
                  <input
                    name={`value:${prod}`}
                    type="number"
                    step="0.01"
                    defaultValue={DEFAULT_VALUES[prod]}
                    className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm"
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <label className="text-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Validade (dias)
            </span>
            <input
              name="validDays"
              type="number"
              defaultValue={30}
              min={1}
              className="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="min-w-52 flex-1 text-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Observações (aparecem na proposta)
            </span>
            <input
              name="notes"
              placeholder="Condições especiais, prazo de implantação…"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"
          >
            Gerar proposta →
          </button>
          <span className="text-xs text-slate-400">
            Cria P-XXXX vN na aba Propostas e abre a versão para PDF.
          </span>
        </div>
      </form>
    </div>
  );
}
