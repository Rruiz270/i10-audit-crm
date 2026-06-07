import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { listAudiences } from '@/lib/actions/marketing/audiences';
import { listTemplates } from '@/lib/actions/marketing/templates';
import { createCampaign } from '@/lib/actions/marketing/campaigns';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ audienceId?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { projectId } = await params;
  const { audienceId: preselectRaw } = await searchParams;
  const preselectAudienceId = preselectRaw ? Number(preselectRaw) : null;
  const id = Number(projectId);
  const project = await getProject(id);
  if (!project) notFound();

  const [aud, tpl] = await Promise.all([listAudiences(id), listTemplates(id)]);

  if (aud.length === 0 || tpl.length === 0) {
    return (
      <div className="px-8 py-8 max-w-3xl">
        <header className="mb-6">
          <Link
            href={`/marketing/${id}/campaigns`}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            ← Campanhas
          </Link>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
            Nova campanha
          </h1>
        </header>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">
          <p className="font-semibold mb-2">Pré-requisitos faltando:</p>
          <ul className="list-disc list-inside space-y-1">
            {aud.length === 0 && (
              <li>
                Pelo menos 1 audiência →{' '}
                <Link href={`/marketing/${id}/audiences`} className="underline">
                  importar CSV
                </Link>
              </li>
            )}
            {tpl.length === 0 && (
              <li>
                Pelo menos 1 template →{' '}
                <Link href={`/marketing/${id}/templates`} className="underline">
                  criar template
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-3xl">
      <header className="mb-6">
        <Link
          href={`/marketing/${id}/campaigns`}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ← Campanhas
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
          Nova campanha
        </h1>
      </header>

      <form
        action={createCampaign}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <input type="hidden" name="projectId" value={id} />

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Nome <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="E1 — D-14 — Webinar invite (prefeito pessoal)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Audiência <span className="text-red-500">*</span>
            </label>
            <select
              name="audienceId"
              required
              defaultValue={
                preselectAudienceId && aud.some((a) => a.id === preselectAudienceId)
                  ? String(preselectAudienceId)
                  : undefined
              }
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {aud.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.contactCount} contatos)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Template <span className="text-red-500">*</span>
            </label>
            <select
              name="templateId"
              required
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <optgroup label="📧 Email">
                {tpl
                  .filter((t) => t.channel === 'email')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="💬 WhatsApp">
                {tpl
                  .filter((t) => t.channel === 'whatsapp')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Channel da campanha = channel do template selecionado. WhatsApp exige audience com
              contatos que tenham phone/whatsapp.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Provider (opcional)
            </label>
            <select
              name="provider"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="">Default ({process.env.MARKETING_EMAIL_PROVIDER ?? 'brevo'})</option>
              <option value="brevo">Brevo</option>
              <option value="ses">AWS SES</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Rate (envios/min)
            </label>
            <input
              name="ratePerMinute"
              type="number"
              defaultValue={30}
              min={1}
              max={1000}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 rounded p-3">
          <b>Próximo passo:</b> depois de criar, você poderá fazer dry-run (ver quem seria enviado
          sem disparar) ou launch real. A campanha começa em <code>draft</code> — nada é enviado até
          você dar launch explícito.
        </div>

        <button
          type="submit"
          className="bg-i10-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-i10-800"
        >
          Criar campanha
        </button>
      </form>
    </div>
  );
}
