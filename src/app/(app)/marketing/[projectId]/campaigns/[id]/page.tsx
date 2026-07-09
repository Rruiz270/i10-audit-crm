import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getProject } from '@/lib/actions/marketing/projects';
import { ConfirmSubmit } from '@/components/confirm-submit';
import {
  getCampaign,
  getCampaignStats,
  getBouncedRecipients,
  launchCampaign,
} from '@/lib/actions/marketing/campaigns';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; id: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const { projectId, id } = await params;
  const projId = Number(projectId);
  const campaignId = Number(id);
  const project = await getProject(projId);
  if (!project) notFound();
  const campaign = await getCampaign(campaignId);
  if (!campaign) notFound();
  const stats = await getCampaignStats(campaignId);
  const bounced = await getBouncedRecipients(campaignId);

  const isLaunched = campaign.status !== 'draft';

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/marketing/${projId}/campaigns`}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            ← Campanhas
          </Link>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--i10-navy)' }}>
            {campaign.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            status: <code className="bg-slate-100 px-1 rounded">{campaign.status}</code> · provider:{' '}
            {campaign.provider ?? 'default'} · rate: {campaign.ratePerMinute}/min ·{' '}
            {campaign.totalRecipients} destinatários
          </p>
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <section className="mb-8">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Enviados" value={stats.sentCount} total={stats.totalRecipients} />
            <Stat label="Entregues" value={stats.deliveredCount} total={stats.totalRecipients} />
            <Stat label="Opens" value={stats.openCount} total={stats.deliveredCount || 1} />
            <Stat label="Clicks" value={stats.clickCount} total={stats.deliveredCount || 1} />
            <Stat label="Bounces" value={stats.bounceCount} total={stats.totalRecipients} negative />
            <Stat label="Unsubscribes" value={stats.unsubscribeCount} total={stats.deliveredCount || 1} negative />
            <Stat
              label="Complaints"
              value={stats.complaintCount}
              total={stats.deliveredCount || 1}
              negative
            />
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Por status</div>
              <div className="mt-2 space-y-0.5 text-xs">
                {Object.entries(stats.sendsByStatus).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bounces — clicável (lista os e-mails que falharam) */}
      {bounced.length > 0 && (
        <details className="mb-8 bg-white border border-slate-200 rounded-xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none">
            📭 {bounced.length} e-mails com bounce — clique para ver quais
          </summary>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 sticky top-0 bg-white">
                <tr>
                  <th className="text-left py-1 font-medium">E-mail</th>
                  <th className="text-left py-1 font-medium">Tipo</th>
                  <th className="text-left py-1 font-medium">Município</th>
                </tr>
              </thead>
              <tbody>
                {bounced.map((b, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 font-mono text-slate-700">{b.email}</td>
                    <td className="py-1">
                      {b.reason === 'hard_bounce' ? (
                        <span className="text-red-600">🔴 hard</span>
                      ) : (
                        <span className="text-amber-600">🟡 soft</span>
                      )}
                    </td>
                    <td className="py-1 text-slate-500">{b.municipio ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Launch / dry-run */}
      {!isLaunched && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          {process.env.MARKETING_TEST_ALLOWLIST && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <span className="font-bold">🛑 TEST MODE:</span> mesmo no Launch real, só envia pra
              emails na allowlist (
              <code className="bg-amber-100 px-1 rounded">
                {process.env.MARKETING_TEST_ALLOWLIST}
              </code>
              ). Outros viram <code>blocked_test_mode</code> sem chamar Brevo.
            </div>
          )}
          <h2 className="text-base font-semibold text-slate-900 mb-3">Lançar campanha</h2>
          <p className="text-xs text-slate-500 mb-4">
            <b>Dry-run</b> = simula sem enviar (mostra contagem de elegíveis).{' '}
            <b>Launch</b> = enfileira sends reais. Use o limit pra fazer envio escalonado (ex: 50
            primeiros pra teste).
          </p>
          <form action={launchCampaign} className="space-y-3">
            <input type="hidden" name="campaignId" value={campaignId} />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Limit (0 = todos)
              </label>
              <input
                name="limit"
                type="number"
                defaultValue={0}
                min={0}
                className="w-32 border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                name="dryRun"
                value="1"
                className="bg-slate-200 text-slate-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-300"
              >
                Dry-run (não envia)
              </button>
              <ConfirmSubmit
                name="dryRun"
                value="0"
                message="Enviar a campanha AGORA para todos os destinatários elegíveis? Esta ação é irreversível."
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
              >
                ⚠️ Launch real (envia agora)
              </ConfirmSubmit>
            </div>
          </form>
        </section>
      )}

      {isLaunched && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Campanha já em status <code>{campaign.status}</code>. Sends sendo processados pelo cron
          worker (1x/min).
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  total,
  negative,
}: {
  label: string;
  value: number;
  total: number;
  negative?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${negative && value > 0 ? 'text-red-600' : 'text-slate-900'}`}>
        {value.toLocaleString('pt-BR')}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{pct}%</div>
    </div>
  );
}
