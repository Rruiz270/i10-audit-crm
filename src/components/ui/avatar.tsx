/**
 * Avatar para o inbox de Conversas (WhatsApp/Twilio).
 *
 * O WhatsApp/Twilio NÃO expõe a foto de perfil do contato (privacidade) — só
 * temos o nome. Por isso os avatares são gerados, nunca buscados externamente:
 *
 *   variant='contact' → círculo com até 2 iniciais do nome, cor de fundo
 *                       determinística (hash do nome → índice na paleta).
 *   variant='i10'     → monograma da marca: círculo navy com "i10", o "10" em
 *                       mint — espelha o brand mark da sidebar/wordmark.
 *
 * Server-safe (sem 'use client', sem estado): puro a partir das props.
 */

// Paleta determinística para os avatares de contato. Tons saturados o bastante
// para contraste com texto branco bold. Index escolhido por hash do nome.
const PALETTE = [
  '#0A2463', // navy
  '#0096C7', // cyan-dark
  '#00C48A', // mint-dark
  '#7C3AED', // violet
  '#DB2777', // pink
  '#EA580C', // orange
  '#0891B2', // teal
  '#4F46E5', // indigo
  '#65A30D', // lime-dark
  '#BE123C', // rose-dark
];

function hashIndex(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  variant = 'contact',
  size = 36,
}: {
  name?: string | null;
  variant?: 'contact' | 'i10';
  size?: number;
}) {
  const dim = { width: size, height: size };

  if (variant === 'i10') {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full font-extrabold leading-none tracking-tight"
        style={{
          ...dim,
          background: 'var(--i10-navy)',
          fontSize: Math.round(size * 0.4),
        }}
        aria-label="i10"
      >
        <span>
          <span style={{ color: '#FFFFFF' }}>i</span>
          <span style={{ color: 'var(--i10-mint)' }}>10</span>
        </span>
      </span>
    );
  }

  const label = (name ?? '').trim();
  const initials = initialsFrom(label);
  const bg = PALETTE[hashIndex(label || '?', PALETTE.length)]!;

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold leading-none text-white"
      style={{ ...dim, background: bg, fontSize: Math.round(size * 0.4) }}
      aria-label={label || 'contato'}
    >
      {initials}
    </span>
  );
}
