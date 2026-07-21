import { notFound, redirect } from 'next/navigation';
import {
  getConversation,
  getConversationContext,
  getApprovedTemplates,
  getCannedResponses,
  listAssignableAgents,
  markConversationRead,
} from '@/lib/actions/marketing/conversations';
import { requireUser } from '@/lib/session';
import { ChatClient, type ChatMsg } from '@/components/atende/chat-client';
import { InboxAutoRefresh } from '@/components/inbox-auto-refresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'i10 · Conversa' };

function detectMedia(mediaUrls: unknown): { hasMedia: boolean; hasAudio: boolean } {
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return { hasMedia: false, hasAudio: false };
  const hasAudio = mediaUrls.some((m) => {
    if (typeof m === 'string') return /\.(ogg|opus|mp3|m4a|aac|webm|wav)(\?|$)/i.test(m);
    const ct = (m as { contentType?: string })?.contentType ?? '';
    const url = (m as { url?: string })?.url ?? '';
    return ct.startsWith('audio') || /\.(ogg|opus|mp3|m4a|aac|webm|wav)(\?|$)/i.test(url);
  });
  return { hasMedia: true, hasAudio };
}

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const convId = Number(id);
  if (!Number.isFinite(convId)) notFound();

  const me = await requireUser();
  const data = await getConversation(convId);
  if (!data) redirect('/atende'); // sem acesso ou inexistente

  const { conversation: conv, messages } = data;

  // Marca como lida (best-effort) e carrega contexto/templates/agentes.
  await markConversationRead(convId).catch(() => {});
  const [context, templates, agents, canned] = await Promise.all([
    getConversationContext(convId).catch(() => ({ opportunity: null, campaignName: null, projectName: null })),
    getApprovedTemplates(conv.projectId).catch(() => []),
    listAssignableAgents().catch(() => []),
    getCannedResponses(conv.projectId).catch(() => []),
  ]);
  const audioEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  const ownerName =
    conv.assignedTo && conv.assignedTo !== me.id
      ? agents.find((a) => a.id === conv.assignedTo)?.name ?? null
      : null;

  const chatMsgs: ChatMsg[] = messages
    .filter((m) => !m.deletedAt)
    .map((m) => {
      const media = detectMedia(m.mediaUrls);
      return {
        id: m.id,
        direction: m.direction,
        body: m.body,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        status: m.status,
        isTemplate: m.isTemplate,
        templateSid: m.templateSid,
        hasAudio: media.hasAudio,
        hasMedia: media.hasMedia,
      };
    });

  return (
    <>
      <InboxAutoRefresh intervalMs={6000} conversationId={conv.id} />
      <ChatClient
      conversationId={conv.id}
      contactName={conv.contactName}
      waPhone={conv.waPhone}
      muni={context.opportunity?.municipio ?? null}
      uf={null}
      projectName={context.projectName}
      windowExpiresAt={conv.windowExpiresAt ? new Date(conv.windowExpiresAt).toISOString() : null}
      assignedTo={conv.assignedTo}
      ownerName={ownerName}
      notes={conv.notes}
      tags={conv.tags ?? []}
      meId={me.id}
      messages={chatMsgs}
      context={context}
      agents={agents}
      templates={templates}
      cannedResponses={canned.map((c) => ({ id: c.id, title: c.title, body: c.body }))}
      audioEnabled={audioEnabled}
    />
    </>
  );
}
