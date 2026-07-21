import { headers } from 'next/headers';

// ─── Rate limiting dos endpoints públicos (signup, intake, APM, webhooks) ───
// Janela fixa por IP. Usa Upstash Redis via REST quando UPSTASH_REDIS_REST_URL/
// UPSTASH_REDIS_REST_TOKEN existem (contagem compartilhada entre instâncias);
// sem essas envs, cai num Map em memória — proteção por instância, suficiente
// contra scraping/flood simples e sem dependência nova.
// Em erro de infra o limiter FALHA ABERTO: captação de lead nunca é bloqueada
// por indisponibilidade do Redis.

type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

const memoryHits = new Map<string, { count: number; resetAt: number }>();
const MEMORY_MAX_KEYS = 10_000;

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memoryHits.size >= MEMORY_MAX_KEYS) {
      for (const [k, v] of memoryHits) {
        if (v.resetAt <= now) memoryHits.delete(k);
      }
      if (memoryHits.size >= MEMORY_MAX_KEYS) memoryHits.clear();
    }
    memoryHits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

async function upstashLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(windowMs), 'NX'],
      ]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = Number(data?.[0]?.result);
    if (!Number.isFinite(count)) return null;
    if (count > limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
    return { ok: true, retryAfterSeconds: 0 };
  } catch {
    return null; // fail open — cai pro limiter em memória
  }
}

/** IP do cliente atrás do proxy da Vercel (primeiro hop do x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const hdrs = await headers();
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Aplica rate limit por IP num escopo (ex.: 'signup', 'intake').
 * `{ ok: false }` significa: recuse a requisição (429 / erro amigável).
 */
export async function rateLimitByIp(
  scope: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const ip = await clientIp();
  const key = `rl:${scope}:${ip}`;
  const remote = await upstashLimit(key, opts.limit, opts.windowMs);
  if (remote) return remote;
  return memoryLimit(key, opts.limit, opts.windowMs);
}
