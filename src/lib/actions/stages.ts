'use server';

import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pipelineStages } from '@/lib/schema';
import { requireUser } from '@/lib/session';

/**
 * Dynamic pipeline stages: estágios padrão são seeded pelo migrate-stages.mjs
 * (is_custom=false). Admins podem adicionar estágios CUSTOM — que aparecem
 * entre os padrão na ordem definida.
 *
 * Importante:
 *   · Estágios padrão NÃO podem ser deletados (só desativados)
 *   · canAdvance() / rotDays usam DEFAULTs pra estágios customizados desconhecidos
 *   · qualquer oportunidade com `stage` apontando pra um key inexistente fica
 *     oculta do Kanban até que o admin crie ou reative o estágio.
 */

const createSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e underscore'),
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  color: z
    .enum([
      'slate-500',
      'blue-500',
      'indigo-500',
      'violet-500',
      'amber-500',
      'orange-500',
      'emerald-500',
      'rose-500',
      'cyan-500',
      'pink-500',
    ])
    .default('cyan-500'),
  order: z.coerce.number().int().min(0).max(999),
  probability: z.coerce.number().min(0).max(1).default(0.5),
  rotDays: z.coerce.number().int().min(0).max(365).optional(),
});

export async function listStages() {
  return db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.isActive, true))
    .orderBy(asc(pipelineStages.order));
}

export async function listAllStagesIncludingInactive() {
  return db.select().from(pipelineStages).orderBy(asc(pipelineStages.order));
}

export async function createCustomStage(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const d = parsed.data;

  // Checar chave única
  const existing = await db
    .select({ key: pipelineStages.key })
    .from(pipelineStages)
    .where(eq(pipelineStages.key, d.key))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false as const, error: `Já existe um estágio com a chave "${d.key}"` };
  }

  await db.insert(pipelineStages).values({
    key: d.key,
    label: d.label,
    description: d.description || null,
    color: d.color,
    order: d.order,
    probability: d.probability,
    rotDays: d.rotDays ?? null,
    isCustom: true,
    isActive: true,
    isTerminal: false,
    isWon: false,
  });

  revalidatePath('/settings/stages');
  revalidatePath('/pipeline');
  return { ok: true as const };
}

export async function updateStage(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const key = String(formData.get('key') ?? '');
  if (!key) return { ok: false as const, error: 'key obrigatório' };

  const label = formData.get('label')?.toString().trim();
  const description = formData.get('description')?.toString().trim();
  const color = formData.get('color')?.toString();
  const order = formData.get('order') ? Number(formData.get('order')) : undefined;
  const probability = formData.get('probability')
    ? Number(formData.get('probability'))
    : undefined;
  const rotDaysRaw = formData.get('rotDays')?.toString();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (label) patch.label = label;
  if (description !== undefined) patch.description = description || null;
  if (color) patch.color = color;
  if (order !== undefined && Number.isFinite(order)) patch.order = order;
  if (probability !== undefined && Number.isFinite(probability))
    patch.probability = Math.max(0, Math.min(1, probability));
  if (rotDaysRaw !== undefined) {
    patch.rotDays = rotDaysRaw === '' ? null : Math.max(0, Number(rotDaysRaw));
  }

  await db.update(pipelineStages).set(patch).where(eq(pipelineStages.key, key));
  revalidatePath('/settings/stages');
  revalidatePath('/pipeline');
  return { ok: true as const };
}

export async function toggleStageActive(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const key = String(formData.get('key') ?? '');
  if (!key) return { ok: false as const, error: 'key obrigatório' };
  const existing = await db.query.pipelineStages.findFirst({
    where: eq(pipelineStages.key, key),
  });
  if (!existing) return { ok: false as const, error: 'Estágio não encontrado' };
  await db
    .update(pipelineStages)
    .set({ isActive: !existing.isActive, updatedAt: new Date() })
    .where(eq(pipelineStages.key, key));
  revalidatePath('/settings/stages');
  revalidatePath('/pipeline');
  return { ok: true as const, active: !existing.isActive };
}

export async function deleteCustomStage(formData: FormData) {
  const user = await requireUser();
  if (!['admin', 'gestor'].includes(user.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const key = String(formData.get('key') ?? '');
  const existing = await db.query.pipelineStages.findFirst({
    where: eq(pipelineStages.key, key),
  });
  if (!existing) return { ok: false as const, error: 'Estágio não encontrado' };
  if (!existing.isCustom) {
    return { ok: false as const, error: 'Estágios padrão não podem ser deletados (use desativar)' };
  }
  await db.delete(pipelineStages).where(eq(pipelineStages.key, key));
  revalidatePath('/settings/stages');
  revalidatePath('/pipeline');
  return { ok: true as const };
}
