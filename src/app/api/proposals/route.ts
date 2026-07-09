import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { proposals } from '@/lib/schema';

// ─── API do planner embutido (public/proposal-planner.html) ────────────────
// O planner original postava num Neon próprio; embutido no CRM, o "Gerar PDF"
// grava direto em crm.proposals (vinculado à oportunidade do prefill).

const KEY_TO_PRODUCT: Record<string, string> = {
  fundeb: 'Acelerador FUNDEB',
  integral: 'Ensino Integral',
  bilingue: 'Município Bilíngue',
  radar: 'Radar Fiscal 360',
  online: 'Escola Online',
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // O gate original valida senha aqui — dentro do CRM a sessão já autentica.
  if (body?.action === 'login') {
    return NextResponse.json({ ok: true });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: 'não autenticado' }, { status: 401 });

  const opportunityId = Number(body?.opportunity_id);
  if (!opportunityId) {
    return NextResponse.json({
      ok: false,
      error: 'sem oportunidade vinculada (abra o planner pela oportunidade)',
    });
  }

  const products = (Array.isArray(body?.products) ? body.products : [])
    .map((k: string) => KEY_TO_PRODUCT[k] ?? k)
    .filter(Boolean);
  const yearly = Number(body?.total_yearly) || 0;
  const oneTime = Number(body?.total_onetime) || 0;
  const total = yearly > 0 ? Math.round(yearly / 12) : oneTime || null;

  const [ver] = await db
    .select({ v: sql<number>`coalesce(max(${proposals.version}), 0)::int` })
    .from(proposals)
    .where(eq(proposals.opportunityId, opportunityId));
  const [seq] = await db.select({ n: sql<number>`count(*)::int` }).from(proposals);

  const number =
    String(body?.numero ?? '').trim() || `P-${String((seq?.n ?? 0) + 1).padStart(4, '0')}`;

  const [created] = await db
    .insert(proposals)
    .values({
      opportunityId,
      number,
      version: Number(body?.versao) || (ver?.v ?? 0) + 1,
      products,
      total,
      status: 'enviada',
      notes: String(body?.title ?? '').slice(0, 300) || null,
      items: products.map((p: string) => ({ product: p, value: 0 })),
      createdBy: (session.user as { id?: string }).id ?? null,
    })
    .returning({ id: proposals.id });

  return NextResponse.json({ ok: true, id: created.id });
}
