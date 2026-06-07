import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import {
  listWhatsappTemplatesWithStatus,
  type WhatsappTemplateRow,
} from '@/lib/actions/marketing/whatsapp-templates';
import { getWhatsAppConfig } from '@/lib/marketing/whatsapp-health';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import type { Tone } from '@/components/ui/kpi-tile';
import { TemplateBuilder } from '@/components/marketing/template-builder';
import { TemplateStatusRefresh } from '@/components/marketing/template-status-refresh';

export const dynamic = 'force-dynamic';

// Mapeia o status de aprovação Meta para tom de cor + rótulo PT.
function approvalChip(status: string): { tone: Tone; label: string } {
  switch (status) {
    case 'approved':
      return { tone: 'mint', label: 'Aprovado' };
    case 'pending':
    case 'received':
      return { tone: 'amber', label: 'Pendente' };
    case 'rejected':
      return { tone: 'rose', label: 'Rejeitado' };
    default:
      return { tone: 'slate', label: 'Desconhecido' };
  }
}

function TemplateRow({ t }: { t: WhatsappTemplateRow }) {
  const chip = approvalChip(t.approvalStatus);
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">{t.contentSid}</div>
        </div>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      {t.body && (
        <p className="whitespace-pre-wrap break-words rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {t.body}
        </p>
      )}
      {t.buttons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.buttons.map((b, i) => (
            <span
              key={i}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-cyan-700"
            >
              {b.title}
            </span>
          ))}
        </div>
      )}
      {t.approvalStatus === 'rejected' && t.rejectionReason && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
          Motivo: {t.rejectionReason}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-slate-400">
          {t.category ?? '—'} · {t.language ?? '—'}
        </div>
        <TemplateStatusRefresh contentSid={t.contentSid} />
      </div>
    </Card>
  );
}

export default async function TemplatesPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');

  const wa = getWhatsAppConfig();
  const list = await listWhatsappTemplatesWithStatus().catch(() => [] as WhatsappTemplateRow[]);

  return (
    <div className="max-w-6xl px-8 py-8">
      <div className="mb-4 text-xs text-slate-500">
        <Link href="/marketing" className="text-cyan-700 hover:underline">
          Marketing
        </Link>{' '}
        › Templates WhatsApp
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Templates WhatsApp
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Crie templates no estilo Meta, submeta para aprovação via Twilio Content API e acompanhe o
          status ao vivo. Templates aprovados podem reabrir conversas fora da janela de 24h.
        </p>
        {!wa.configured && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Canal WhatsApp não totalmente configurado (sender ausente). A criação de templates funciona,
            mas o envio depende de um número conectado.
          </div>
        )}
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[3px] text-cyan-700">
          Novo template
        </h2>
        <Card>
          <TemplateBuilder />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[3px] text-cyan-700">
          Templates existentes ({list.length})
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum template WhatsApp ainda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <TemplateRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
