import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpportunity } from '@/lib/actions/opportunities';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// ─── Estúdio de proposta DENTRO do CRM ──────────────────────────────────────
// O gerador (i10 Proposal Planner) roda embutido no shell do CRM via iframe,
// já pré-configurado com os dados da oportunidade. O registro canônico
// (nº/versão/status) fica na aba Propostas da oportunidade.
export default async function PropostaStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const op = await getOpportunity(Number(id));
  if (!op) notFound();

  const primary = op.contacts.find((c) => c.isPrimary) ?? op.contacts[0];
  const prefill = encodeURIComponent(
    JSON.stringify({
      municipio: op.municipalityName ?? '',
      opportunity_id: op.id,
      gestor: primary?.name ?? '',
      rep: op.ownerName ?? '',
    }),
  );
  const src = `https://www.institutoi10.com.br/proposals#prefill=${prefill}`;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
        <div>
          <Link
            href={`/opportunities/${op.id}`}
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            ← Voltar para {op.municipalityName ?? `oportunidade #${op.id}`}
          </Link>
          <p className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
            📄 Estúdio de proposta — {op.municipalityName ?? `#${op.id}`}
          </p>
        </div>
        <p className="hidden text-xs text-slate-400 md:block">
          Ao finalizar, registre a versão na aba <b>Propostas</b> da oportunidade.
        </p>
      </div>
      <iframe src={src} title="i10 Proposal Planner" className="w-full flex-1 border-0" />
    </div>
  );
}
