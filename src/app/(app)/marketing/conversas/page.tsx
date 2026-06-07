import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { getWhatsAppConfig } from '@/lib/marketing/whatsapp-health';
import { InboxAutoRefresh } from '@/components/inbox-auto-refresh';
import { InboxComposer } from '@/components/inbox-composer';
import { InboxContactHeader } from '@/components/inbox-contact-header';
import { InboxMarkRead } from '@/components/inbox-mark-read';
import { isAdmin } from '@/lib/roles';
import { getInboxContact, type InboxContactDetail } from '@/lib/actions/marketing/inbox-contacts';
import {
  listConversations,
  getConversation,
  claimConversation,
  closeConversation,
  hasConversationAccess,
  saveConversationContext,
  getCannedResponses,
  getConversationContext,
  getApprovedTemplates,
} from '@/lib/actions/marketing/conversations';

export const dynamic = 'force-dynamic';

// Tick de read-receipt no estilo WhatsApp (sutil, sem emoji):
//   queued/sending/sent → ✓ cinza · delivered → ✓✓ cinza ·
//   read → ✓✓ ciano (var(--i10-cyan)) · failed/undelivered → "falhou" rosa.
function MessageTicks({ status }: { status: string | null }) {
  if (!status) return null;
  if (status === 'failed' || status === 'undelivered') {
    return <span className="text-rose-500"> · falhou</span>;
  }
  if (status === 'read') {
    return (
      <span style={{ color: 'var(--i10-cyan)' }} title="Lida"> · ✓✓</span>
    );
  }
  if (status === 'delivered') {
    return <span title="Entregue"> · ✓✓</span>;
  }
  // queued | sending | sent
  return <span title="Enviada"> · ✓</span>;
}

// Detecta se a mensagem tem mídia de áudio. mediaUrls (jsonb) pode ser:
//   - string[] (formato legado do inbound) → assume áudio se a url sugerir
//   - { url, contentType }[] (novo formato com tipo) → checa contentType
// O player aponta para o proxy autenticado (/api/marketing/media/[id]/[idx]),
// nunca direto pra Twilio (que exige Basic auth pra baixar a mídia).
function audioFromMedia(mediaUrls: unknown): boolean {
  if (!Array.isArray(mediaUrls)) return false;
  return mediaUrls.some((m) => {
    if (typeof m === 'string') return /\.(ogg|opus|mp3|m4a|aac|webm|wav)(\?|$)/i.test(m);
    if (m && typeof m === 'object') {
      const ct = (m as { contentType?: string }).contentType ?? '';
      const url = (m as { url?: string }).url ?? '';
      return ct.startsWith('audio') || /\.(ogg|opus|mp3|m4a|aac|webm|wav)(\?|$)/i.test(url);
    }
    return false;
  });
}

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
  const admin = isAdmin(user.role);

  const { c } = await searchParams;
  const convs = await listConversations();
  const selectedId = c ? Number(c) : convs[0]?.id;
  const selected = selectedId ? await getConversation(selectedId) : null;
  // mark-as-read foi movido para o cliente (<InboxMarkRead/>): invocar uma
  // Server Action durante o render do Server Component derrubava a página.

  if (convs.length === 0) {
    return (
      <div className="px-8 py-8 max-w-3xl">
        <InboxAutoRefresh />
        <div className="mb-4 text-xs text-slate-500">
          <Link href="/marketing" className="text-cyan-700 hover:underline">Marketing</Link> › Conversas
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>Conversas WhatsApp</h1>
        {admin && (
          <div className="mt-4 max-w-sm">
            <InboxContactHeader />
          </div>
        )}
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

  // F2.1 — dados extras do painel + composer (só para a conversa selecionada).
  // Resiliência: um fetch que falhe NÃO pode derrubar o inbox inteiro (degrada
  // pro fallback e loga o erro real). Antes, um throw aqui virava o genérico
  // "Server Components render error".
  const logFetch = (label: string) => (e: unknown) => {
    console.error(`[conversas] falha em ${label} (conv ${conv?.id}):`, e);
    return undefined as never;
  };
  const [cannedResponses, ctx, approvedTemplates] = conv
    ? await Promise.all([
        getCannedResponses(conv.projectId).catch(() => [] as Awaited<ReturnType<typeof getCannedResponses>>),
        getConversationContext(conv.id).catch((e) => {
          logFetch('getConversationContext')(e);
          return { opportunity: null, campaignName: null, projectName: null };
        }),
        (win?.expired
          ? getApprovedTemplates(conv.projectId)
          : Promise.resolve([] as Awaited<ReturnType<typeof getApprovedTemplates>>)
        ).catch(() => [] as Awaited<ReturnType<typeof getApprovedTemplates>>),
      ])
    : [[], { opportunity: null, campaignName: null, projectName: null }, []];

  // Enriquecimento do painel: dados do contato de marketing vinculado.
  const inboxContact: InboxContactDetail | null =
    admin && conv?.contactId
      ? await getInboxContact(conv.contactId).catch((e) => {
          logFetch('getInboxContact')(e);
          return null;
        })
      : null;

  return (
    <div className="grid h-[calc(100vh-0px)] grid-cols-[300px_1fr_280px]">
      <InboxAutoRefresh />
      {/* lista */}
      <div className="overflow-auto border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-bold" style={{ color: 'var(--i10-navy)' }}>Conversas</div>
          <Link href="/marketing" className="text-xs text-cyan-700 hover:underline">← Hub</Link>
          {admin && (
            <div className="mt-3">
              <InboxContactHeader />
            </div>
          )}
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
              {selected!.messages.map((m) => {
                const audio = audioFromMedia(m.mediaUrls);
                return (
                  <div
                    key={m.id}
                    className={`max-w-[62%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === 'outbound'
                        ? 'self-end rounded-br-sm bg-[#d9fdd3]'
                        : 'self-start rounded-bl-sm border border-slate-200 bg-white'
                    }`}
                  >
                    {audio && (
                      <audio
                        controls
                        preload="none"
                        src={`/api/marketing/media/${m.id}/0`}
                        className="mb-1 h-9 w-56 max-w-full"
                      />
                    )}
                    {m.body && <div>{m.body}</div>}
                    <div className="mt-1 text-right text-[10px] text-slate-400">
                      {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      {m.direction === 'outbound' && <MessageTicks status={m.status} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <InboxMarkRead conversationId={conv.id} />
            <InboxComposer
              conversationId={conv.id}
              windowExpired={Boolean(win?.expired)}
              cannedResponses={cannedResponses}
              approvedTemplates={approvedTemplates}
              audioEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
            />
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
            <div className="text-sm font-semibold text-slate-900">
              {inboxContact?.name ?? conv.contactName ?? '—'}
            </div>
            <div className="text-sm text-slate-600">{conv.waPhone}</div>
            {inboxContact && (
              <div className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                {(inboxContact.municipio || inboxContact.uf) && (
                  <div>
                    {inboxContact.municipio ?? '—'}
                    {inboxContact.uf ? `/${inboxContact.uf}` : ''}
                  </div>
                )}
                {inboxContact.source && (
                  <div>
                    Origem: <span className="font-medium text-slate-600">{inboxContact.source}</span>
                  </div>
                )}
                <div className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                  base unificada
                </div>
              </div>
            )}

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Oportunidade (CRM)
            </h4>
            {ctx.opportunity ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-800">
                  {ctx.opportunity.municipio ?? `Oportunidade #${ctx.opportunity.id}`}
                </div>
                <div className="text-xs text-slate-600">
                  {ctx.opportunity.stageLabel}
                  {ctx.opportunity.owner ? ` · ${ctx.opportunity.owner}` : ''}
                </div>
                <Link
                  href={`/opportunities/${ctx.opportunity.id}`}
                  className="mt-1 inline-block text-xs text-cyan-700 hover:underline"
                >
                  Abrir no CRM →
                </Link>
              </div>
            ) : (
              <div className="text-sm text-slate-400">— não vinculada</div>
            )}

            {(ctx.campaignName || ctx.projectName) && (
              <>
                <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Origem</h4>
                <div className="text-sm text-slate-700">
                  {ctx.campaignName ?? (conv.campaignId ? `Campanha #${conv.campaignId}` : '—')}
                </div>
                {ctx.projectName && <div className="text-xs text-slate-500">{ctx.projectName}</div>}
              </>
            )}

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

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Tags</h4>
            {conv.tags && conv.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {conv.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-800">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <form action={saveConversationContext} className="flex gap-1.5">
              <input type="hidden" name="conversationId" value={conv.id} />
              <input
                name="tags"
                defaultValue={(conv.tags ?? []).join(', ')}
                placeholder="tag1, tag2…"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Salvar
              </button>
            </form>

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Notas internas</h4>
            <form action={saveConversationContext}>
              <input type="hidden" name="conversationId" value={conv.id} />
              <textarea
                name="notes"
                defaultValue={conv.notes ?? ''}
                placeholder="Anotações privadas sobre este contato…"
                className="h-20 w-full resize-none rounded-md border border-slate-300 p-2 text-xs"
              />
              <div className="mt-1.5 flex justify-end">
                <button className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Salvar notas
                </button>
              </div>
            </form>

            <h4 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</h4>
            <div className="text-sm text-slate-700">{conv.status}</div>
          </>
        )}
      </div>
    </div>
  );
}
