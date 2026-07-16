// Helpers puros do app /atende (client-safe, sem imports de server).

const AVATAR_COLORS = [
  '#e74c3c', '#8e44ad', '#2980b9', '#16a085', '#d35400',
  '#27ae60', '#c0392b', '#2c3e50', '#00B4D8', '#0A2463',
];

export function avatarColor(seed: string | null | undefined): string {
  const s = seed ?? '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string | null | undefined, fallback?: string | null): string {
  const src = (name && name.trim()) || fallback || '';
  const parts = src.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    // sem nome: usa os 2 últimos dígitos do telefone
    const digits = (fallback ?? '').replace(/\D/g, '');
    return digits.slice(-2) || '?';
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Nome de exibição: nome do contato ou telefone formatado.
export function displayName(name: string | null | undefined, phone: string): string {
  if (name && name.trim()) return name.trim();
  return formatPhone(phone);
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  // +55 15 99999-4321
  if (d.length >= 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const mid = rest.length > 8 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length > 8 ? rest.slice(5) : rest.slice(4);
    return `+55 ${ddd} ${mid}-${end}`;
  }
  return phone;
}

// Hora curta estilo WhatsApp: hoje = "14:32"; ontem = "Ontem"; senão data.
export function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export type WindowState = { label: string; cls: 'ok' | 'warn' | 'dead' };

// Estado da janela de 24h da Meta (a partir do último inbound).
export function windowState(iso: string | null | undefined): WindowState {
  if (!iso) return { label: '🔒 fora da janela', cls: 'dead' };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: '🔒 fora da janela', cls: 'dead' };
  const hours = Math.floor(ms / 3_600_000);
  const cls = hours < 6 ? 'warn' : 'ok';
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return { label: `🕑 janela ${mins}min`, cls: 'warn' };
  }
  return { label: `🕑 janela ${hours}h`, cls };
}

export function windowExpired(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
}
