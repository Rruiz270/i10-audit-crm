import type { WhatsAppConfig, TemplateApproval, WaQuota } from '@/lib/marketing/whatsapp-health';

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

// Medidor da quota Meta — conversas iniciadas nas últimas 24h vs. tier do
// número. Verde < 80%, âmbar ≥ 80%, vermelho no teto (launch bloqueado).
export function WaQuotaMeter({ quota }: { quota: WaQuota }) {
  const pct = quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 100;
  const tone =
    quota.remaining === 0
      ? { bar: 'bg-rose-500', text: 'text-rose-700' }
      : pct >= 80
        ? { bar: 'bg-amber-500', text: 'text-amber-700' }
        : { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-semibold ${tone.text}`}>
          {quota.used.toLocaleString('pt-BR')} / {quota.limit.toLocaleString('pt-BR')}
        </span>
        <span className="text-xs text-slate-400">
          restam {quota.remaining.toLocaleString('pt-BR')}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function WhatsAppHealthPanel({
  config,
  quota,
  templates,
}: {
  config: WhatsAppConfig;
  quota: WaQuota;
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
          <div className="text-xs text-slate-500">Conversas iniciadas · 24h</div>
          <WaQuotaMeter quota={quota} />
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
