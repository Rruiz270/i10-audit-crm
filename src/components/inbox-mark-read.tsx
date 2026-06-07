'use client';

import { useEffect } from 'react';
import { markConversationRead } from '@/lib/actions/marketing/conversations';

/**
 * Marca a conversa como lida no CLIENTE (useEffect), não no render do server.
 * Invocar uma Server Action durante o render do Server Component derruba a
 * página ("Server Components render error") nesta versão do Next. Aqui o
 * efeito roda após a montagem — lugar correto para side-effects.
 */
export function InboxMarkRead({ conversationId }: { conversationId: number }) {
  useEffect(() => {
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);
  return null;
}
