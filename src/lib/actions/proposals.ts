'use server';

import { desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { proposals, opportunities } from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

// ─── Propostas dentro do CRM ────────────────────────────────────────────────
// Registro canônico por oportunidade. Criar registra atividade; mudar status
// para 'enviada'/'aceita' também (a aceita pré-preenche o valor do Ganho).

export async function listProposals(opportunityId: number) {
  await requireUser();
  return db
    .select()
    .from(proposals)
    .where(eq(proposals.opportunityId, opportunityId))
    .orderBy(desc(proposals.createdAt));
}

export async function createProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const opportunityId = Number(formData.get('opportunityId'));
  const products = formData.getAll('products').map(String).filter(Boolean);
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const validDays = Math.max(1, Number(formData.get('validDays')) || 30);
  const goPrint = String(formData.get('goPrint') ?? '') === '1';
  if (!opportunityId) throw new Error('opportunityId obrigatório');

  // Itens com valor por produto (gerador nativo): value:<produto> no form.
  const items = products.map((prod) => ({
    product: prod,
    value: Number(formData.get(`value:${prod}`)) || 0,
  }));
  const computedTotal = items.reduce((s, i) => s + i.value, 0);
  const total = Number(formData.get('total')) || (computedTotal > 0 ? computedTotal : null);

  // Nº sequencial global P-0001, P-0002…; nova proposta da mesma opp = v+1
  const [seq] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(proposals);
  const [ver] = await db
    .select({ v: sql<number>`coalesce(max(${proposals.version}), 0)::int` })
    .from(proposals)
    .where(eq(proposals.opportunityId, opportunityId));

  const number = `P-${String((seq?.n ?? 0) + 1).padStart(4, '0')}`;
  const [created] = await db
    .insert(proposals)
    .values({
      opportunityId,
      number,
      version: (ver?.v ?? 0) + 1,
      products,
      total,
      items,
      validDays,
      notes,
      createdBy: user.id,
    })
    .returning({ id: proposals.id, number: proposals.number, version: proposals.version });

  await logActivity({
    opportunityId,
    type: 'proposal',
    subject: `Proposta criada: ${created.number} v${created.version}`,
    actorId: user.id,
    metadata: { proposalId: created.id, products, total },
  });
  revalidatePath(`/opportunities/${opportunityId}`);
  if (goPrint) redirect(`/proposta/${created.id}`);
}

export async function setProposalStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!id || !['rascunho', 'enviada', 'aceita', 'recusada'].includes(status)) return;

  const [p] = await db
    .update(proposals)
    .set({ status, updatedAt: new Date() })
    .where(eq(proposals.id, id))
    .returning({
      opportunityId: proposals.opportunityId,
      number: proposals.number,
      version: proposals.version,
      total: proposals.total,
    });
  if (!p) return;

  await logActivity({
    opportunityId: p.opportunityId,
    type: 'proposal',
    subject: `Proposta ${p.number} v${p.version} → ${status}`,
    actorId: user.id,
    metadata: { proposalId: id, status },
  });
  // Aceita pré-preenche o valor estimado do Ganho (se houver total)
  if (status === 'aceita' && p.total) {
    await db
      .update(opportunities)
      .set({ estimatedValue: p.total, updatedAt: new Date() })
      .where(eq(opportunities.id, p.opportunityId));
  }
  revalidatePath(`/opportunities/${p.opportunityId}`);
}


export async function getProposalFull(id: number) {
  await requireUser();
  const [p] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  return p ?? null;
}
