import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpportunity } from '@/lib/actions/opportunities';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// ─── Planejador de Propostas OFICIAL, embutido no CRM ──────────────────────
// Cópia local do i10 Proposal Planner (public/proposal-planner.html): sem
// senha (a sessão do CRM já autentica), com prefill do card via hash e o
// "Gerar PDF" salvando direto em crm.proposals (API /api/proposals).
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

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2">
        <div>
          <Link
            href={`/opportunities/${op.id}`}
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            ← Voltar para {op.municipalityName ?? `oportunidade #${op.id}`}
          </Link>
          <p className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
            ✨ Planejador de Propostas — formato oficial
          </p>
        </div>
        <p className="hidden text-xs text-slate-400 md:block">
          “Gerar PDF” salva a versão automaticamente na aba <b>Propostas</b>.
        </p>
      </div>
      <iframe
        src={`/proposal-planner.html#prefill=${prefill}`}
        title="i10 Proposal Planner"
        className="w-full flex-1 border-0"
      />
    </div>
  );
}
