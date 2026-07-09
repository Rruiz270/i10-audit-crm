import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getWhatsAppConfig } from '@/lib/marketing/whatsapp-health';
import {
  createWaCampaign,
  getWaWizardData,
  previewWaDetailed,
  type WaPreviewDetailed,
  type WaPublicMode,
} from '@/lib/actions/marketing/wa-wizard';

// Meta limita conversas iniciadas pelo negócio por dia (tier atual ≈ 2k).
const META_DAILY_TIER = 2000;

// Resolve o valor de uma variável do template p/ um contato da amostra —
// espelha o mergeVars do launch (canônicos + attributes).
function sampleVarValue(
  c: WaPreviewDetailed['sample'][number],
  variable: string,
): string | null {
  if (variable === 'nome') return c.name ?? (c.attributes.nome as string | undefined) ?? null;
  if (variable === 'municipio') return c.municipio;
  if (variable === 'uf') return c.uf;
  const v = c.attributes[variable];
  return v == null || v === '' ? null : String(v);
}

export const dynamic = 'force-dynamic';

// Wizard "Nova campanha WhatsApp" — porta de entrada única do disparo em massa:
// 1) template aprovado (Content SID)  2) público (filtros do Leads Hub, audiência
// existente ou lista colada)  3) prévia  4) cria campanha draft → dry-run/launch
// na página da campanha (pipeline existente).
export default async function NewWhatsAppCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const sp = await searchParams;
  const mode = (sp.mode ?? 'filters') as WaPublicMode;
  const wantsPreview = sp.preview === '1';

  const [wa, data] = await Promise.all([
    Promise.resolve(getWhatsAppConfig()),
    getWaWizardData(),
  ]);

  // Prévia do público (GET) — sem enviar nada. Detalhada: contagens + amostra
  // de quem entra + cobertura das variáveis do template selecionado.
  let preview: WaPreviewDetailed | null = null;
  if (wantsPreview) {
    preview = await previewWaDetailed({
      mode,
      filters: { q: sp.q, source: sp.source, uf: sp.uf, role: sp.role },
      audienceId: Number(sp.audienceId) || undefined,
      list: sp.list,
      templateId: Number(sp.templateId) || undefined,
    });
  }

  const selectedTemplate = data.templates.find((t) => t.id === Number(sp.templateId));
  const newProjectName = (sp.newProject ?? '').trim();
  const missingProject = mode !== 'audience' && !sp.projectId && !newProjectName;
  const canCreate =
    wantsPreview && preview && preview.withPhone > 0 && selectedTemplate && !missingProject;

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-6">
        <Link href="/marketing" className="text-xs text-slate-500 hover:text-slate-700">
          ← Marketing engine
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Nova campanha WhatsApp
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Template aprovado → público (Leads Hub) → prévia → campanha draft. Nada é enviado até o
          launch explícito na página da campanha.
        </p>
      </header>

      {/* Remetente */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Número remetente</div>
          <div className="text-sm font-semibold text-slate-900 mt-0.5">
            {wa.fromNumber ?? 'não configurado'}{' '}
            <span className="font-normal text-slate-500">· Instituto i10 · provider {wa.provider}</span>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${wa.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
        >
          {wa.configured ? 'configurado' : 'sem credenciais'}
        </span>
      </div>

      {/* Form GET — tudo vira querystring; "Prever público" recarrega com a prévia */}
      <form method="get" className="space-y-6">
        <input type="hidden" name="preview" value="1" />

        {/* 1 · Template */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">1 · Template aprovado</h2>
          <p className="text-xs text-slate-500 mb-3">
            Disparo frio (contato que nunca respondeu) exige template aprovado pela Meta com Content
            SID (HX…).{' '}
            <Link href="/marketing/templates" className="underline">
              Criar/aprovar novo template →
            </Link>
          </p>
          {data.templates.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded p-3">
              Nenhum template WhatsApp com Content SID. Crie um no builder e aguarde a aprovação da
              Meta.
            </p>
          ) : (
            <select
              name="templateId"
              required
              defaultValue={sp.templateId}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">— escolher template —</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.category ?? 'sem categoria'} · {t.waTemplateName}
                </option>
              ))}
            </select>
          )}
          {selectedTemplate?.text && (
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 whitespace-pre-wrap">
              {selectedTemplate.text}
            </div>
          )}
        </section>

        {/* 2 · Público */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">2 · Público</h2>
          <p className="text-xs text-slate-500 mb-4">
            Escolha UMA das três formas de compor o batch. Só contatos ativos e com telefone entram;
            números suprimidos (opt-out ou sem WhatsApp) são cortados no launch.
          </p>

          <div className="space-y-5">
            {/* a) Filtros do Leads Hub */}
            <div className="rounded-lg border border-slate-200 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="radio" name="mode" value="filters" defaultChecked={mode === 'filters'} />
                Filtrar do Leads Hub (estado, origem/evento, papel)
              </label>
              <p className="text-xs text-slate-400 mt-1">
                Os filtros se <strong>combinam</strong> (interseção): UF <em>e</em> origem <em>e</em>{' '}
                papel. Os números entre parênteses são o total de cada filtro isolado — a prévia
                abaixo mostra o recorte combinado.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-3 sm:grid-cols-4">
                <select name="uf" defaultValue={sp.uf ?? ''} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                  <option value="">UF — todas</option>
                  {data.facets.uf.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
                <select name="source" defaultValue={sp.source ?? ''} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                  <option value="">Origem/evento — todas</option>
                  {data.facets.source.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
                <select name="role" defaultValue={sp.role ?? ''} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                  <option value="">Papel — todos</option>
                  {data.facets.role.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
                <input
                  name="q"
                  defaultValue={sp.q ?? ''}
                  placeholder="busca (município, nome…)"
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* b) Audiência existente */}
            <div className="rounded-lg border border-slate-200 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="radio" name="mode" value="audience" defaultChecked={mode === 'audience'} />
                Usar audiência existente
              </label>
              <select
                name="audienceId"
                defaultValue={sp.audienceId ?? ''}
                className="mt-3 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">— escolher audiência —</option>
                {data.audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.contactCount} contatos · projeto: {a.projectName ?? a.projectId}
                  </option>
                ))}
              </select>
            </div>

            {/* c) Lista colada */}
            <div className="rounded-lg border border-slate-200 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input type="radio" name="mode" value="paste" defaultChecked={mode === 'paste'} />
                Colar lista de e-mails ou telefones (um por linha)
              </label>
              <textarea
                name="list"
                rows={4}
                defaultValue={sp.list ?? ''}
                placeholder={'prefeito@cidade.sp.gov.br\n+55 15 99999-9999\n(15) 3232-1234'}
                className="mt-3 w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                Casamos com a base do Leads Hub por e-mail exato ou pelos últimos 11 dígitos do
                telefone (tolera +55, máscara e espaços).
              </p>
            </div>
          </div>
        </section>

        {/* 3 · Configuração */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-3">3 · Configuração</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome da campanha <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                defaultValue={sp.name ?? ''}
                required
                placeholder="WA — Sorocaba — convite 26/jun (prefeitos)"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rate (envios/min)</label>
              <input
                name="ratePerMinute"
                type="number"
                defaultValue={sp.ratePerMinute ?? 30}
                min={1}
                max={1000}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Projeto (onde a campanha e a audiência ficam)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  name="projectId"
                  defaultValue={sp.projectId ?? ''}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">— escolher projeto existente —</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  name="newProject"
                  defaultValue={sp.newProject ?? ''}
                  placeholder="…ou nome de um projeto novo (ex: PB Prefeitos 2026)"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Campanha de assunto novo? Deixe o select vazio e digite o nome — o projeto é criado
                junto com a campanha. No modo “audiência existente” o projeto da audiência é usado
                automaticamente.
              </p>
            </div>
          </div>
        </section>

        <button
          type="submit"
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          🔍 Prever público (não envia)
        </button>
      </form>

      {/* Revisão antes de criar — números, quem entra, mensagem de exemplo e
          cobertura das variáveis. Nada é enviado aqui. */}
      {wantsPreview && (
        <section className="mt-6 rounded-xl border-2 border-i10-300 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Revisão antes de criar</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Confira o recorte, a mensagem de exemplo e as variáveis. Nada é enviado agora — o
            disparo real só acontece após o launch explícito na página da campanha.
          </p>

          {/* Resumo do que foi escolhido */}
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              Template: <strong>{selectedTemplate?.name ?? '— não escolhido —'}</strong>
            </span>
            {mode === 'filters' && (
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                Recorte: {[
                  sp.uf && `UF ${sp.uf}`,
                  sp.source && `origem ${sp.source}`,
                  sp.role && `papel ${sp.role}`,
                  sp.q && `busca "${sp.q}"`,
                ]
                  .filter(Boolean)
                  .join(' + ') || 'todos os contatos ativos'}
              </span>
            )}
            {mode === 'audience' && (
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                Audiência: {data.audiences.find((a) => a.id === Number(sp.audienceId))?.name ?? '—'}
              </span>
            )}
            {mode === 'paste' && (
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                Lista colada ({preview?.tokens ?? 0} linhas)
              </span>
            )}
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              Rate: {sp.ratePerMinute ?? 30}/min
            </span>
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              Projeto:{' '}
              {data.projects.find((p) => p.id === Number(sp.projectId))?.name ??
                (newProjectName ? `novo: "${newProjectName}"` : '—')}
            </span>
          </div>

          {!preview || preview.matched === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded p-3">
              Nenhum contato encontrado nesse recorte
              {mode === 'audience' ? ' — escolha uma audiência válida.' : '.'}
              {mode === 'filters' &&
                ' Lembre que os filtros se combinam — experimente afrouxar um deles.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-2xl font-bold text-slate-900">
                    {preview.matched.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-xs text-slate-500">contatos no recorte</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-700">
                    {preview.withPhone.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-xs text-slate-500">com telefone (entram na campanha)</div>
                </div>
                {preview.matched > preview.withPhone && (
                  <div>
                    <div className="text-2xl font-bold text-amber-600">
                      {(preview.matched - preview.withPhone).toLocaleString('pt-BR')}
                    </div>
                    <div className="text-xs text-slate-500">sem telefone (ficam de fora)</div>
                  </div>
                )}
              </div>

              {preview.withPhone > META_DAILY_TIER && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  ⚠️ Recorte acima do tier diário da Meta (~
                  {META_DAILY_TIER.toLocaleString('pt-BR')} conversas/dia). O rate espalha os
                  envios, mas o que passar do limite diário pode falhar — considere dividir em
                  lotes.
                </p>
              )}

              {/* Cobertura das variáveis do template */}
              {preview.varCoverage.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Variáveis do template
                  </h3>
                  <ul className="space-y-1 text-xs">
                    {preview.varCoverage.map((v, i) => (
                      <li key={v.variable}>
                        {v.missing === 0 ? (
                          <span className="text-emerald-700">
                            ✓ {'{{'}
                            {i + 1}
                            {'}}'} <code>{v.variable}</code> — preenchida para todos
                          </span>
                        ) : (
                          <span className="text-red-700">
                            ✗ {'{{'}
                            {i + 1}
                            {'}}'} <code>{v.variable}</code> —{' '}
                            <strong>{v.missing.toLocaleString('pt-BR')}</strong> contato(s) sem esse
                            dado (sairia em branco!)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Mensagem de exemplo com o 1º contato da amostra */}
              {selectedTemplate?.text && preview.sample[0] && preview.varCoverage.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Exemplo real — como {preview.sample[0].name ?? 'o primeiro contato'} (
                    {preview.sample[0].municipio ?? 'sem município'}) vai receber
                  </h3>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-slate-800 whitespace-pre-wrap max-w-lg">
                    {preview.varCoverage.reduce(
                      (body, v, i) =>
                        body.replaceAll(
                          `{{${i + 1}}}`,
                          sampleVarValue(preview.sample[0], v.variable) ?? `⚠️(sem ${v.variable})`,
                        ),
                      selectedTemplate.text,
                    )}
                  </div>
                </div>
              )}

              {/* Amostra de quem entra */}
              {preview.sample.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Amostra do público ({preview.sample.length} de{' '}
                    {preview.withPhone.toLocaleString('pt-BR')})
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Nome</th>
                          <th className="text-left px-3 py-2 font-medium">Município</th>
                          <th className="text-left px-3 py-2 font-medium">UF</th>
                          <th className="text-left px-3 py-2 font-medium">Telefone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.sample.map((c, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-slate-800">{c.name ?? '—'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{c.municipio ?? '—'}</td>
                            <td className="px-3 py-1.5 text-slate-600">{c.uf ?? '—'}</td>
                            <td className="px-3 py-1.5 text-slate-600 font-mono">{c.phone ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {canCreate && (
            <form action={createWaCampaign} className="mt-5 border-t border-slate-100 pt-4">
              {/* eco do estado do wizard */}
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="templateId" value={sp.templateId ?? ''} />
              <input type="hidden" name="name" value={sp.name ?? ''} />
              <input type="hidden" name="ratePerMinute" value={sp.ratePerMinute ?? '30'} />
              <input type="hidden" name="projectId" value={sp.projectId ?? ''} />
              <input type="hidden" name="newProject" value={sp.newProject ?? ''} />
              <input type="hidden" name="audienceId" value={sp.audienceId ?? ''} />
              <input type="hidden" name="q" value={sp.q ?? ''} />
              <input type="hidden" name="uf" value={sp.uf ?? ''} />
              <input type="hidden" name="source" value={sp.source ?? ''} />
              <input type="hidden" name="role" value={sp.role ?? ''} />
              <input type="hidden" name="list" value={sp.list ?? ''} />
              <p className="text-xs text-slate-500 mb-3">
                Cria a campanha em <code>draft</code> com a audiência acima. O disparo real acontece
                na próxima tela (dry-run e launch).
              </p>
              <button
                type="submit"
                className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
              >
                Confirmar e criar campanha (draft) →
              </button>
            </form>
          )}
          {wantsPreview && !selectedTemplate && (
            <p className="mt-4 text-xs text-amber-700">
              Escolha um template aprovado acima para poder criar a campanha.
            </p>
          )}
          {wantsPreview && missingProject && (
            <p className="mt-4 text-xs text-amber-700">
              Escolha um projeto — ou digite o nome de um novo — na seção 3 para poder criar a
              campanha.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
