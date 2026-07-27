import { NextResponse } from 'next/server';
import { getPublicProposal, trackReadSeconds } from '@/lib/proposal-public';

// Beacon de tempo de leitura da proposta pública (navigator.sendBeacon /
// fetch keepalive). Sempre responde 204 — não vaza se um par id/token existe.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      proposalId?: number;
      token?: string;
      sessionKey?: string;
      seconds?: number;
    };
    const proposalId = Number(body.proposalId);
    const token = String(body.token ?? '');
    const sessionKey = String(body.sessionKey ?? '');
    const seconds = Number(body.seconds);

    const p = await getPublicProposal(proposalId, token);
    if (p && sessionKey && Number.isFinite(seconds)) {
      await trackReadSeconds(
        { id: p.id, opportunityId: p.opportunityId, number: p.number, version: p.version },
        sessionKey,
        seconds,
        req.headers.get('user-agent'),
      );
    }
  } catch {
    // Silencioso por design: beacon não tem quem trate erro do outro lado.
  }
  return new NextResponse(null, { status: 204 });
}
