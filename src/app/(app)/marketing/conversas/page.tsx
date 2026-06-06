import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getWhatsAppConfig } from '@/lib/marketing/whatsapp-health';

export const dynamic = 'force-dynamic';

// Placeholder da F2 — inbox de Conversas WhatsApp ao vivo.
// O sender já está plugado; o inbox (webhook inbound + Twilio Conversations + 3 painéis) chega na F2.
export default async function ConversasPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect('/');
  const wa = getWhatsAppConfig();

  return (
    <div className="px-8 py-8 max-w-3xl">
      <div className="mb-4 text-xs text-slate-500">
        <Link href="/marketing" className="text-cyan-700 hover:underline">
          Marketing
        </Link>{' '}
        › Conversas
      </div>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
        Conversas WhatsApp
      </h1>
      <p className="mt-1 text-sm text-slate-500">Inbox ao vivo do número oficial do Instituto i10.</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
          Em construção (Fase 2)
        </div>
        <p className="mt-3 text-sm text-slate-700">
          O sender de produção já está conectado{' '}
          <b>{wa.fromNumber ?? '—'}</b>
          {wa.configured ? ' (online)' : ''}. O inbox ao vivo — com lista por projeto, thread,
          painel de contexto e a trava da janela de 24h — chega na próxima fase.
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
          <li>• Webhook de mensagens recebidas (inbound)</li>
          <li>• Threads por contato (Twilio Conversations)</li>
          <li>• Atribuição por dono da oportunidade / fila do projeto</li>
          <li>• Acesso por papel (agente / supervisor / admin)</li>
        </ul>
        <Link
          href="/marketing"
          className="mt-5 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Voltar ao hub
        </Link>
      </div>
    </div>
  );
}
