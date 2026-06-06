import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { getWhatsAppConfig } from '@/lib/marketing/whatsapp-health';
import { InboxAutoRefresh } from '@/components/inbox-auto-refresh';
import {
  listConversations,
  getConversation,
  sendConversationReply,
  claimConversation,
  closeConversation,
  markConversationRead,
  hasConversationAccess,
} from '@/lib/actions/marketing/conversations';

export const dynamic = 'force-dynamic';

function windowLabel(expiresAt: Date | null): { text: string; tone: string; expired: boolean } {
  if (!expiresAt) return { text: 'sem janela', tone: 'bg-slate-100 text-slate-500', expired: true };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'janela expirada', tone: 'bg-rose-100 text-rose-700', expired: true };
  const h = Math.floor(ms / 3_600_000);
  const tone = h < 3 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
  return { text: h >= 1 ? `${h}h restantes` : '<1h restante', tone, expired: false };
}

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  // F3: admin/gestor (supervisor) sempre entram; consultor (agente) só entra
  // se tiver ≥1 fila por projeto. Quem não tem acesso algum cai pra raiz.
  if (!(await hasConversationAccess())) redirect('/');
  const wa = getWhatsAppConfig();

  const { c } = await searchParams;
  const convs = await listConversations();
  const selectedId = c ? Number(c) : convs[0]?.id;
  const selected = selectedId ? await getConversation(selectedId) : null;
  if (selected?.conversation.unread) await markConversationRead(selected.conversation.id);

  if (convs.length === 0) {
    return (
      <div className="px-8 py-8 max-w-3xl">
        <InboxAutoRefresh />
        <div className="mb-4 text-xs text-slate-500">
          <Link href="/marketing" className="text-cyan-700 hover:underline">Marketing</Link> › Conversas
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>Conversas WhatsApp</h1>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            Inbox ativo · aguardando mensagens
          </div>
          <p className="mt-3 text-sm text-slate-700">
            O inbox está <b>no ar</b> e o sender <b>{wa.fromNumber ?? '—'}</b> conectado. Assim que um
            contato responder uma campanha ou mandar mensagem para o número oficial, a conversa aparece aqui.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Configure no Twilio o webhook de <b>incoming messages</b> do sender apontando para{' '}
            <code>{wa.fromNumber ? `${process.env.MARKETING_BASE_URL ?? ''}/api/marketing/webhooks/twilio` : '…'}</code>.
          </p>
        </div>
      </div>
    );
  }

  const conv = selected?.conversation ?? null;
  const win = conv ? windowLabel(conv.windowExpiresAt) : null;

  return (
    <div className="grid h-[calc(100vh-0px)] grid-cols-[300px_1fr_280px]">
      <InboxAutoRefresh />
      {/* lista */}
      <div className="overflow-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-bold" style={{ color: 'var(--i10-navy)' }}>Conversas</div>
          <Link href="/marketing" className="text-xs text-cyan-700 hover:underline">← Hub</Link>
        </div>
        {convs.map((cv) => {
          const w = windowLabel(cv.windowExpiresAt);
          const isSel = cv.id === selectedId;
          return (
            <Link
              key={cv.id}
              href={`/marketing/conversas?c=${cv.id}`}
              className={`block border-b border-slate-100 p-3 ${isSel ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {cv.contactName ?? cv.waPhone}
                </span>
                {cv.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-500" />}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{cv.waPhone}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${w.tone}`}>{w.text}</span>
                {cv.status === 'closed' && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">fechada</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* thread */}
      <div className="flex flex-col bg-slate-100">
        {conv ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div>
                <span className="font-semibold" style={{ color: 'var(--i10-navy)' }}>
                  {conv.contactName ?? conv.waPhone}
                </span>
                <span className="ml-2 text-xs text-slate-400">{conv.waPhone}</span>
              </div>
              {win && <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${win.tone}`}>⏱ {win.text}</span>}
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-auto p-5">
              {selected!.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[62%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === 'outbound'
                      ? 'self-end rounded-br-sm bg-[#d9fdd3]'
                      : 'self-start rounded-bl-sm border border-slate-200 bg-white'
                  }`}
                >
                  {m.body}
                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    {m.direction === 'outbound' && m.status === 'sent' && ' · ✓'}
                    {m.direction === 'outbound' && m.status === 'failed' && ' · falhou'}
                  </div>
                </div>
              ))}
            </div>

            {win && !win.expired ? (
              <form action={sendConversationReply} className="border-t border-slate-200 bg-white p-3">
                <input type="hidden" name="conversationId" value={conv.id} />
                <textarea
                  name="body"
                  required
                  placeholder="Resposta (mensagem livre, dentro da janela de 24h)…"
                  className="h-14 w-full resize-none rounded-lg border border-slate-300 p-2.5 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <button className="rounded-md bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-[#06223e]">
                    Enviar
                  </button>
                </div>
              </form>
            ) : (
              <div className="border-t border-slate-200 bg-white p-3">
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  <b>Janela de 24h expirada</b> — mensagem livre bloqueada (regra da Meta). Reabrir a
                  conversa exige um <b>template aprovado</b> (chega numa próxima iteração do inbox).
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-slate-400">Selecione uma conversa</div>
        )}
      </div>

      {/* contexto */}
      <div className="overflow-auto border-l border-slate-200 bg-white p-4">
        {conv && (
          <>
            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Contato</h4>
            <div className="text-sm font-semibold text-slate-900">{conv.contactName ?? '—'}</div>
            <div className="text-sm text-slate-600">{conv.waPhone}</div>

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Atribuição</h4>
            <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-3">
              <div className="text-sm text-slate-700">
                Responsável: <b>{conv.assignedTo ? (conv.assignedTo === user.id ? 'Você' : conv.assignedTo) : '— ninguém'}</b>
              </div>
              <div className="mt-2 flex gap-2">
                {conv.assignedTo !== user.id && (
                  <form action={claimConversation}>
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Assumir
                    </button>
                  </form>
                )}
                {conv.status !== 'closed' && (
                  <form action={closeConversation}>
                    <input type="hidden" name="conversationId" value={conv.id} />
                    <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Fechar
                    </button>
                  </form>
                )}
              </div>
            </div>

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</h4>
            <div className="text-sm text-slate-700">{conv.status}</div>
            {conv.campaignId && (
              <>
                <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Origem</h4>
                <div className="text-sm text-slate-700">Campanha #{conv.campaignId}</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
