import { EventEmitter } from 'node:events';

// ─── Barramento in-memory do inbox (fast-path de tempo real) ───────────────
// O webhook do Twilio emite aqui ao gravar inbound/status; os streams SSE
// abertos (/api/atende/stream) escutam e checam o cursor imediatamente, sem
// esperar o próximo tick. É BEST-EFFORT: na Vercel (Fluid Compute) webhook e
// stream podem cair em instâncias diferentes — nesse caso o polling barato do
// cursor no banco (fonte da verdade) entrega a mudança no tick seguinte.
// Guardado em globalThis para sobreviver ao HMR do dev server.
const g = globalThis as typeof globalThis & { __i10InboxEvents?: EventEmitter };

export const inboxEvents: EventEmitter =
  g.__i10InboxEvents ??
  (g.__i10InboxEvents = (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // 1 listener por stream SSE aberto — sem teto
    return e;
  })());

// Notifica que algo mudou no inbox. conversationId permite que streams de uma
// conversa específica ignorem mudanças de outras conversas; null = mudança geral.
export function notifyInboxChange(conversationId?: number | null) {
  inboxEvents.emit('change', conversationId ?? null);
}
