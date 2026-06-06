import type { WhatsAppConfig, TemplateApproval } from '@/lib/marketing/whatsapp-health';

// Badge de canal — 📧 Email / 💬 WhatsApp. Pure, client-safe.
export function ChannelBadge({ channel }: { channel?: string | null }) {
  const isWa = channel === 'whatsapp';
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
        isWa ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      {isWa ? '💬 WhatsApp' : '📧 Email'}
    </span>
  );
}

const APPROVAL_TONE: Record<TemplateApproval['status'], { label: string; cls: string }> = {
  approved: { label: 'aprovado', cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'em revisão', cls: 'bg-amber-100 text-amber-700' },
  received: { label: 'na fila', cls: 'bg-amber-100 text-amber-700' },
  rejected: { label: 'rejeitado', cls: 'bg-rose-100 text-rose-700' },
  unknown: { label: 'sem status', cls: 'bg-slate-100 text-slate-500' },
};

export function ApprovalBadge({ status }: { status: TemplateApproval['status'] }) {
  const t = APPROVAL_TONE[status] ?? APPROVAL_TONE.unknown;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${t.cls}`}>{t.label}</span>;
}

export function WhatsAppHealthPanel({
  config,
  templates,
}: {
  config: WhatsAppConfig;
  templates: Array<{ id: number; name: string; contentSid: string; approval: TemplateApproval }>;
}) {
  return (
    <section className="mb-8 bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          💬 Canal WhatsApp
        </h2>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            config.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}
        >
          {config.configured ? 'configurado' : 'não configurado'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Número remetente</div>
          <div className="font-medium text-slate-900">
            {config.fromNumber ?? '—'}
            {config.fromNumber && !config.isProduction && (
              <span className="ml-1 text-xs text-amber-600">(sandbox)</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Provider</div>
          <div className="font-medium text-slate-900">{config.provider}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Limite</div>
          <div className="font-medium text-slate-900 text-xs">{config.dailyLimitNote}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-slate-500 mb-2">
          Templates aprovados pela Meta (necessários pra iniciar conversa com prefeitos)
        </div>
        {templates.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nenhum template WhatsApp com Content SID neste projeto. Crie um em Templates e cole o
            Content SID (HX…) do template aprovado.
          </p>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 text-sm border border-slate-100 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{t.name}</div>
                  <div className="text-xs text-slate-400 font-mono truncate">{t.contentSid}</div>
                </div>
                <ApprovalBadge status={t.approval.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
