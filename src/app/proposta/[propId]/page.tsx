import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { proposals, opportunities, contacts, fundebMunicipalities, users } from '@/lib/schema';
import { diagnosticoForMunicipality } from '@/lib/prospecting';
import {
  ensureProposalPublicToken,
  getProposalEngagement,
  registerProposalView,
} from '@/lib/proposal-public';
import { acceptProposalAction } from '@/lib/actions/proposal-accept';
import { PrintButton } from '@/components/print-button';
import { ProposalReadTracker } from '@/components/proposal-read-tracker';

export const dynamic = 'force-dynamic';

// ─── Proposta interativa (brandbook i10) ────────────────────────────────────
// Dois modos na mesma rota:
//  · Interno (com sessão): imprimível como antes + link público e engajamento.
//  · Público (?t=<token>): página personalizada para a prefeitura — valor de
//    recuperação estimado do município, tracking de visualização/tempo de
//    leitura (push para o vendedor) e aceite digital, que marca contractSigned
//    e dispara o handoff automático para o BNCC-CAPTACAO.

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function brl0(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default async function PropostaPage({
  params,
  searchParams,
}: {
  params: Promise<{ propId: string }>;
  searchParams: Promise<{ t?: string; aceite?: string; erro?: string }>;
}) {
  const [{ propId }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  const token = typeof sp.t === 'string' ? sp.t : '';

  const [p] = await db.select().from(proposals).where(eq(proposals.id, Number(propId))).limit(1);
  if (!p) notFound();

  const isInternal = !!session?.user;
  // Acesso público só com o token exato da proposta (capability URL).
  if (!isInternal && (!token || !p.publicToken || token !== p.publicToken)) {
    redirect('/login');
  }

  const [op] = await db
    .select({
      id: opportunities.id,
      ownerId: opportunities.ownerId,
      municipalityId: opportunities.municipalityId,
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

  // Valor de recuperação estimado do município (dados públicos FNDE/SIOPE).
  const diagnostico = op?.municipalityId
    ? await diagnosticoForMunicipality(op.municipalityId)
    : null;

  // Visita pública: registra view + notifica o vendedor (primeira vez/retorno).
  if (!isInternal) {
    const ua = (await headers()).get('user-agent');
    await registerProposalView(
      { id: p.id, opportunityId: p.opportunityId, number: p.number, version: p.version },
      ua,
    );
  }

  // Visão interna: garante token (backfill de propostas antigas) + métricas.
  const shareToken = isInternal ? p.publicToken ?? (await ensureProposalPublicToken(p.id)) : null;
  const engagement = isInternal ? await getProposalEngagement(p.id) : null;
  const shareUrl = shareToken
    ? `${process.env.AUTH_URL ?? ''}/proposta/${p.id}?t=${shareToken}`
    : null;

  const items = ((p.items ?? []) as Array<{ product: string; value: number }>).filter(Boolean);
  const total = p.total ?? items.reduce((s, i) => s + (i.value || 0), 0);
  const issued = p.createdAt ? new Date(p.createdAt) : new Date();
  const validUntil = new Date(issued.getTime() + (p.validDays ?? 30) * 24 * 3600_000);
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const valorEstimado = diagnostico?.valorEstimado ?? null;
  const investimentoAnual = total ? total * 12 : null;
  const multiplo =
    valorEstimado && investimentoAnual && investimentoAnual > 0
      ? valorEstimado / investimentoAnual
      : null;
  const aceita = p.status === 'aceita';

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Tracking de leitura — só na visão do cliente */}
      {!isInternal && token && <ProposalReadTracker proposalId={p.id} token={token} />}

      {isInternal ? (
        <>
          {/* Barra de ações (some na impressão) */}
          <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-6 print:hidden">
            <a href={`/opportunities/${p.opportunityId}`} className="text-sm text-slate-500 hover:text-slate-700">
              ← Voltar para a oportunidade
            </a>
            <PrintButton className="rounded-md bg-i10-700 px-4 py-2 text-sm font-bold text-white hover:bg-i10-800" />
          </div>

          {/* Link público + engajamento (só interno, some na impressão) */}
          <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-slate-200 bg-white px-5 py-4 print:hidden">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Link interativo para o cliente (visualização + aceite digital)
            </div>
            {shareUrl && (
              <div className="mt-1 select-all break-all rounded bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">
                {shareUrl}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>
                <b className="text-slate-700">{engagement?.views ?? 0}</b> visualizaç
                {(engagement?.views ?? 0) === 1 ? 'ão' : 'ões'}
              </span>
              <span>
                <b className="text-slate-700">{Math.round((engagement?.readSeconds ?? 0) / 60)}</b>{' '}
                min de leitura
              </span>
              {engagement?.lastViewAt && (
                <span>última visita: {engagement.lastViewAt.toLocaleString('pt-BR')}</span>
              )}
              {aceita && p.acceptedAt && (
                <span className="font-bold text-emerald-600">
                  ✓ Aceita por {p.acceptedByName} em{' '}
                  {new Date(p.acceptedAt).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto mb-4 max-w-3xl px-6">
          {sp.erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {sp.erro}
            </div>
          )}
          {sp.aceite === 'ok' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              ✓ Aceite registrado com sucesso! Nossa equipe entrará em contato para o kickoff.
            </div>
          )}
        </div>
      )}

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

        {/* Potencial de recuperação estimado do município (FNDE/SIOPE) */}
        {valorEstimado != null && valorEstimado > 0 && (
          <div
            className="mt-8 rounded-xl px-6 py-5"
            style={{ background: 'linear-gradient(90deg,#0A2463,#0096C7)' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">
              Diagnóstico {diagnostico?.municipio}
              {diagnostico?.anoReferencia ? ` · dados públicos ${diagnostico.anoReferencia}` : ''}
            </div>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-3xl font-extrabold text-white">{brl0(valorEstimado)}/ano</div>
                <div className="text-xs text-cyan-100">
                  potencial estimado de recuperação e incremento FUNDEB via auditoria i10
                </div>
              </div>
              {multiplo != null && multiplo >= 1 && (
                <div className="rounded-lg px-3 py-2 text-right" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <div className="text-xl font-extrabold" style={{ color: '#00E5A0' }}>
                    {multiplo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×
                  </div>
                  <div className="text-[10px] text-cyan-100">o investimento anual da proposta</div>
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* Aceite digital */}
        {aceita ? (
          <div className="mt-8 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-6 py-5">
            <div className="text-lg font-extrabold text-emerald-700">✓ Proposta aceita</div>
            <div className="mt-1 text-sm text-emerald-800">
              Aceite digital registrado por <b>{p.acceptedByName ?? '—'}</b>
              {p.acceptedByRole ? ` (${p.acceptedByRole})` : ''}
              {p.acceptedAt ? ` em ${fmt(new Date(p.acceptedAt))}` : ''}.
            </div>
          </div>
        ) : (
          !isInternal && (
            <form
              action={acceptProposalAction}
              className="mt-8 rounded-xl border-2 px-6 py-5 print:hidden"
              style={{ borderColor: '#00C48A', background: '#F6FEFB' }}
            >
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="token" value={token} />
              <div className="text-lg font-extrabold" style={{ color: '#0A2463' }}>
                Aceite digital
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Ao aceitar, a equipe do Instituto i10 é notificada imediatamente e o processo de
                contratação e kickoff é iniciado com a Prefeitura.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Nome completo *
                  </span>
                  <input
                    name="acceptedByName"
                    required
                    minLength={3}
                    placeholder="Seu nome"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cargo na Prefeitura
                  </span>
                  <input
                    name="acceptedByRole"
                    placeholder="Ex.: Secretário(a) de Educação"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" required className="mt-0.5" />
                <span>
                  Declaro que li a proposta {p.number} v{p.version} e manifesto o aceite dos termos
                  em nome da Prefeitura Municipal de {op?.municipio ?? '—'}.
                </span>
              </label>
              <button
                type="submit"
                className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-extrabold text-white sm:w-auto"
                style={{ background: 'linear-gradient(90deg,#00C48A,#00E5A0)' }}
              >
                ✓ Aceitar proposta
              </button>
            </form>
          )
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
