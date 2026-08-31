'use server';

import { desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  opportunities,
  contacts,
  activities,
  proposals,
  fundebMunicipalities,
  users,
} from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';
import { PRODUCTS } from '@/lib/products';
import { canSeeOpportunity } from '@/lib/visibility';
import { getAccessibleOpportunity } from '@/lib/authz';

// ─── Dados do CARD-MODAL da oportunidade (layout do mockup) ─────────────────
// Clicar num card do kanban abre um modal com abas Resumo/Propostas/Atividades
// sem sair do funil. Este action entrega tudo numa chamada.

export type OppCardData = {
  id: number;
  municipality: string | null;
  stage: string;
  estimatedValue: number | null;
  ownerName: string | null;
  products: string[];
  primaryContact: {
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    marketingContactId: number | null;
  } | null;
  lastInteraction: { label: string; at: string } | null;
  proposals: Array<{
    id: number;
    number: string;
    version: number;
    status: string;
    total: number | null;
    products: string[];
  }>;
  activities: Array<{ type: string; subject: string | null; at: string }>;
};

const LAST_LABEL: Record<string, string> = {
  read: 'leu mensagem',
  delivered: 'recebeu WA',
  replied: 'respondeu',
  open: 'abriu e-mail',
  click: 'clicou no e-mail',
  failed: 'falha de envio',
  download: 'baixou material',
};

export async function getOppCard(id: number): Promise<OppCardData | null> {
  const viewer = await requireUser();
  const [op] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      products: opportunities.products,
      municipality: fundebMunicipalities.nome,
      ownerName: users.name,
      ownerId: opportunities.ownerId,
    })
    .from(opportunities)
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .leftJoin(users, eq(opportunities.ownerId, users.id))
    .where(eq(opportunities.id, id))
    .limit(1);
  if (!op) return null;
  // Anti-IDOR: mesma regra de visibilidade do resto do app — o card expõe
  // contatos de gestores municipais (LGPD).
  if (!canSeeOpportunity(viewer, { ownerId: op.ownerId, stage: op.stage })) {
    return null;
  }

  const [pc] = await db
    .select({
      name: contacts.name,
      role: contacts.role,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      marketingContactId: contacts.marketingContactId,
    })
    .from(contacts)
    .where(eq(contacts.opportunityId, id))
    .orderBy(desc(contacts.isPrimary))
    .limit(1);

  // Última interação do contato principal (events/inbox via ponte)
  let lastInteraction: OppCardData['lastInteraction'] = null;
  if (pc?.marketingContactId) {
    const res = await db.execute(
      sql`SELECT type, at FROM (
            SELECT type, occurred_at AS at FROM marketing.events WHERE contact_id = ${pc.marketingContactId}
            UNION ALL
            SELECT 'replied' AS type, last_inbound_at AS at FROM marketing.conversations
              WHERE contact_id = ${pc.marketingContactId} AND last_inbound_at IS NOT NULL
          ) t ORDER BY at DESC LIMIT 1`,
    );
    const rows = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<
      string,
      unknown
    >[];
    if (rows[0]) {
      lastInteraction = {
        label: LAST_LABEL[String(rows[0].type)] ?? String(rows[0].type),
        at: String(rows[0].at),
      };
    }
  }

  const props = await db
    .select({
      id: proposals.id,
      number: proposals.number,
      version: proposals.version,
      status: proposals.status,
      total: proposals.total,
      products: proposals.products,
    })
    .from(proposals)
    .where(eq(proposals.opportunityId, id))
    .orderBy(desc(proposals.createdAt))
    .limit(10);

  const acts = await db
    .select({ type: activities.type, subject: activities.subject, at: activities.occurredAt })
    .from(activities)
    .where(eq(activities.opportunityId, id))
    .orderBy(desc(activities.occurredAt))
    .limit(8);

  return {
    id: op.id,
    municipality: op.municipality,
    stage: op.stage,
    estimatedValue: op.estimatedValue,
    ownerName: op.ownerName,
    products: (op.products ?? []) as string[],
    primaryContact: pc ?? null,
    lastInteraction,
    proposals: props.map((p) => ({ ...p, products: (p.products ?? []) as string[] })),
    activities: acts.map((a) => ({
      type: a.type,
      subject: a.subject,
      at: a.at ? new Date(a.at).toISOString() : new Date().toISOString(),
    })),
  };
}

// Produto no Resumo (mockup): select direto no modal — grava products=[valor]
// sem esperar o Ganho (funil por produto funciona com opps abertas).
export async function setOpportunityProduct(input: { opportunityId: number; product: string }) {
  const user = await requireUser();
  if (!(PRODUCTS as readonly string[]).includes(input.product)) {
    return { ok: false as const };
  }
  if (!(await getAccessibleOpportunity(user, input.opportunityId))) {
    return { ok: false as const };
  }
  await db
    .update(opportunities)
    .set({ products: [input.product], updatedAt: new Date() })
    .where(eq(opportunities.id, input.opportunityId));
  await logActivity({
    opportunityId: input.opportunityId,
    type: 'note',
    subject: `Produto definido: ${input.product}`,
    actorId: user.id,
  });
  revalidatePath('/pipeline');
  revalidatePath(`/opportunities/${input.opportunityId}`);
  return { ok: true as const };
}
