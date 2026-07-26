import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fundebMunicipalities, leadForms, municipalityProspecting } from '@/lib/schema';
import { diagnosticoForMunicipality, type Diagnostico } from '@/lib/prospecting';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Calculadora de perda FUNDEB · Instituto i10',
  description:
    'Descubra, com dados públicos (FNDE/SIOPE/INEP), quanto seu município pode estar deixando de receber do FUNDEB.',
};

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

async function firstActiveIntakeSlug(): Promise<string | null> {
  const [form] = await db
    .select({ slug: leadForms.slug })
    .from(leadForms)
    .where(eq(leadForms.isActive, true))
    .orderBy(asc(leadForms.createdAt))
    .limit(1);
  return form?.slug ?? null;
}

export default async function CalculadoraPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const municipalityId = m && /^\d+$/.test(m) ? Number(m) : null;

  // Só municípios com dados públicos importados — a calculadora não estima no escuro.
  const municipios = await db
    .select({
      id: fundebMunicipalities.id,
      nome: fundebMunicipalities.nome,
      uf: fundebMunicipalities.uf,
    })
    .from(municipalityProspecting)
    .innerJoin(
      fundebMunicipalities,
      eq(municipalityProspecting.municipalityId, fundebMunicipalities.id),
    )
    .orderBy(asc(fundebMunicipalities.uf), asc(fundebMunicipalities.nome));

  let diagnostico: Diagnostico | null = null;
  if (municipalityId) {
    try {
      diagnostico = await diagnosticoForMunicipality(municipalityId);
    } catch {
      diagnostico = null;
    }
  }

  const intakeSlug = await firstActiveIntakeSlug();

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-i10-700">i10</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">
            Instituto i10 · Auditoria pública
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900">
              Calculadora de perda FUNDEB
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Selecione seu município e veja, com base em dados públicos (FNDE, SIOPE e INEP),
              uma estimativa do quanto ele pode estar deixando de receber do FUNDEB por ano.
            </p>
          </header>

          <form method="get" className="flex flex-col gap-3 sm:flex-row">
            <select
              name="m"
              defaultValue={municipalityId ? String(municipalityId) : ''}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Escolha o município…
              </option>
              {municipios.map((mun) => (
                <option key={mun.id} value={mun.id}>
                  {mun.nome}
                  {mun.uf ? ` / ${mun.uf}` : ''}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="shrink-0 rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
            >
              Calcular
            </button>
          </form>

          {municipalityId && !diagnostico && (
            <p className="mt-6 text-sm text-slate-600">
              Ainda não temos dados públicos consolidados para este município.
              {intakeSlug && (
                <>
                  {' '}
                  <Link href={`/intake/${intakeSlug}`} className="font-medium text-cyan-700 hover:underline">
                    Fale com nossa equipe
                  </Link>{' '}
                  e receba um diagnóstico gratuito personalizado.
                </>
              )}
            </p>
          )}

          {diagnostico && (
            <div className="mt-6">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-cyan-800">
                  {diagnostico.municipio}
                  {diagnostico.uf ? ` / ${diagnostico.uf}` : ''}
                  {diagnostico.anoReferencia ? ` · dados ${diagnostico.anoReferencia}` : ''}
                </div>
                {diagnostico.valorEstimado != null ? (
                  <>
                    <div className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
                      ~{brl(diagnostico.valorEstimado)}/ano
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      é a estimativa do que seu município pode estar deixando de receber
                      (ou recuperar) do FUNDEB via revisão declaratória.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    Não há dados suficientes para estimar um valor — solicite o diagnóstico
                    gratuito da nossa equipe.
                  </p>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">Matrículas na rede</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {diagnostico.matriculas != null
                      ? diagnostico.matriculas.toLocaleString('pt-BR')
                      : '—'}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">Receita FUNDEB/ano</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {diagnostico.receitaFundeb != null ? brl(diagnostico.receitaFundeb) : '—'}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">Complementações da União</dt>
                  <dd className="font-semibold text-slate-900">
                    {diagnostico.recebeVaat || diagnostico.recebeVaar
                      ? [diagnostico.recebeVaat && 'VAAT', diagnostico.recebeVaar && 'VAAR']
                          .filter(Boolean)
                          .join(' + ')
                      : 'Nenhuma'}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">IDEB (anos iniciais)</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {diagnostico.ideb != null
                      ? diagnostico.ideb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                      : '—'}
                  </dd>
                </div>
              </dl>

              {intakeSlug && (
                <Link
                  href={`/intake/${intakeSlug}`}
                  className="mt-5 block rounded-md bg-i10-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-i10-800"
                >
                  Quero recuperar esse valor — falar com o Instituto i10
                </Link>
              )}

              <p className="mt-3 text-xs text-slate-400">
                Estimativa heurística sobre dados públicos (≈2% da receita FUNDEB + 10% da
                complementação VAAT) — não substitui a auditoria detalhada, que é gratuita
                na fase de diagnóstico.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 text-center mt-6">
          Fontes: FNDE (portarias VAAT/VAAR), SIOPE (receita) e INEP (Censo Escolar e IDEB).
        </p>
      </div>
    </div>
  );
}
