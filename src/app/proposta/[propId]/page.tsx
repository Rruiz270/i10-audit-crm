import { notFound, redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { proposals, opportunities, contacts, fundebMunicipalities, users } from '@/lib/schema';
import { PrintButton } from '@/components/print-button';

export const dynamic = 'force-dynamic';

// ─── Proposta imprimível (brandbook i10) ────────────────────────────────────
// Rota fora do shell (sem sidebar) — limpa para Cmd+P → PDF. Gerada 100%
// dentro do CRM com os dados do card + itens escolhidos no builder.

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export default async function PropostaPrintPage({
  params,
}: {
  params: Promise<{ propId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { propId } = await params;
  const [p] = await db.select().from(proposals).where(eq(proposals.id, Number(propId))).limit(1);
  if (!p) notFound();

  const [op] = await db
    .select({
      id: opportunities.id,
      ownerId: opportunities.ownerId,
      municipio: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(eq(opportunities.id, p.opportunityId))
    .limit(1);

  const [primary] = await db
    .select({ name: contacts.name, role: contacts.role })
    .from(contacts)
    .where(eq(contacts.opportunityId, p.opportunityId))
    .orderBy(desc(contacts.isPrimary))
    .limit(1);

  const [rep] = op?.ownerId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, op.ownerId)).limit(1)
    : [{ name: null }];

  const items = ((p.items ?? []) as Array<{ product: string; value: number }>).filter(Boolean);
  const total = p.total ?? items.reduce((s, i) => s + (i.value || 0), 0);
  const issued = p.createdAt ? new Date(p.createdAt) : new Date();
  const validUntil = new Date(issued.getTime() + (p.validDays ?? 30) * 24 * 3600_000);
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Barra de ações (some na impressão) */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-6 print:hidden">
        <a href={`/opportunities/${p.opportunityId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar para a oportunidade
        </a>
        <PrintButton className="rounded-md bg-i10-700 px-4 py-2 text-sm font-bold text-white hover:bg-i10-800" />
      </div>

      {/* Documento */}
      <div className="mx-auto max-w-3xl bg-white p-10 shadow-xl print:max-w-none print:p-8 print:shadow-none">
        {/* Cabeçalho brandbook: 3 barras azul→verde */}
        <div className="flex items-start justify-between border-b-4 pb-6" style={{ borderColor: 'var(--i10-navy, #0A2463)' }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 items-end gap-1">
              <span className="block w-2 rounded-sm" style={{ height: 16, background: '#0096C7' }} />
              <span className="block w-2 rounded-sm" style={{ height: 26, background: '#00B4D8' }} />
              <span className="block w-2 rounded-sm" style={{ height: 36, background: '#00E5A0' }} />
            </span>
            <span>
              <span className="block text-2xl font-extrabold leading-none" style={{ color: '#0A2463' }}>
                Instituto i<span style={{ color: '#00C48A' }}>10</span>
              </span>
              <span className="block text-[11px] tracking-wide text-slate-400">
                institutoi10.com.br · i10@i10.org.br
              </span>
            </span>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold" style={{ color: '#0A2463' }}>
              Proposta {p.number} <span className="text-sm font-semibold text-slate-400">v{p.version}</span>
            </div>
            <div className="text-xs text-slate-500">Emitida em {fmt(issued)}</div>
            <div className="text-xs text-slate-500">Válida até {fmt(validUntil)}</div>
          </div>
        </div>

        {/* Destinatário */}
        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Para</div>
            <div className="mt-0.5 font-bold" style={{ color: '#0A2463' }}>
              Prefeitura Municipal de {op?.municipio ?? '—'}
              {op?.uf ? ` · ${op.uf}` : ''}
            </div>
            {primary?.name && (
              <div className="text-slate-600">
                A/C {primary.name}
                {primary.role ? ` — ${primary.role}` : ''}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Representante i10</div>
            <div className="mt-0.5 font-semibold text-slate-700">{rep?.name ?? '—'}</div>
          </div>
        </div>

        {/* Itens */}
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr
              className="text-left text-[10px] font-bold uppercase tracking-wider text-white"
              style={{ background: '#0A2463' }}
            >
              <th className="rounded-l-md px-4 py-2.5">Solução</th>
              <th className="rounded-r-md px-4 py-2.5 text-right">Investimento mensal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.product} className="border-b border-slate-100">
                <td className="px-4 py-3.5">
                  <div className="font-bold" style={{ color: '#0A2463' }}>{it.product}</div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-800">
                  {brl(it.value || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 pt-4 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
                Total mensal
              </td>
              <td className="px-4 pt-4 text-right">
                <span
                  className="inline-block rounded-lg px-4 py-2 text-lg font-extrabold text-slate-900"
                  style={{ background: 'linear-gradient(90deg,#ADE8F4,#B7F5E0)' }}
                >
                  {brl(total ?? 0)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>

        {p.notes && (
          <div className="mt-6 rounded-lg border-l-4 bg-slate-50 px-4 py-3 text-sm text-slate-700" style={{ borderColor: '#00C48A' }}>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Observações</span>
            {p.notes}
          </div>
        )}

        {/* Rodapé */}
        <div className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-400">
          <p>
            Proposta {p.number} v{p.version} · válida até {fmt(validUntil)} · Instituto i10 —
            educação e gestão pública que transformam municípios.
          </p>
        </div>
      </div>
    </div>
  );
}

