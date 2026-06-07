'use server';

import { asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { opportunities, tags } from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { isAdmin } from '@/lib/roles';
import { logActivity } from '@/lib/activity';
import { TAG_COLOR_OPTS } from '@/lib/tag-colors';

/**
 * Taxonomia de tags gerenciada em banco (crm.tags). Diferente do free-text:
 *   · seed padrão (is_custom=false) vem do migrate-tags.mjs — não deletável
 *   · admin/gestor adiciona tags CUSTOM via /settings/tags
 *   · oportunidades guardam o LABEL da tag em crm.opportunities.tags (text[])
 *
 * Auto-tagging por origem (appendTagByLabel) é resiliente: nunca quebra a
 * criação da oportunidade — falhas são engolidas e logadas no console.
 */

export type TagCategory = 'origem' | 'produto' | 'outro';

export type TagRow = {
  id: number;
  label: string;
  slug: string | null;
  category: string;
  color: string;
  isActive: boolean;
  isCustom: boolean;
};

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function listTags(opts?: { activeOnly?: boolean }): Promise<TagRow[]> {
  const rows = await db
    .select()
    .from(tags)
    .where(opts?.activeOnly ? eq(tags.isActive, true) : undefined)
    .orderBy(asc(tags.category), asc(tags.label));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    slug: r.slug,
    category: r.category,
    color: r.color,
    isActive: r.isActive,
    isCustom: r.isCustom,
  }));
}

/**
 * Mapa label → cor/categoria, usado pelos chips na lista de oportunidades.
 * Inclui tags inativas (uma oportunidade pode ter uma tag que foi desativada
 * depois). Tags fora da taxonomia caem no fallback "slate" no componente.
 */
export async function getTagStyleMap(): Promise<
  Record<string, { color: string; category: string }>
> {
  const rows = await db
    .select({ label: tags.label, color: tags.color, category: tags.category })
    .from(tags);
  const map: Record<string, { color: string; category: string }> = {};
  for (const r of rows) map[r.label] = { color: r.color, category: r.category };
  return map;
}

const createSchema = z.object({
  label: z.string().trim().min(2, 'Label muito curto').max(60),
  category: z.enum(['origem', 'produto', 'outro']).default('outro'),
  color: z.enum(TAG_COLOR_OPTS).default('slate'),
});

export async function createTag(formData: FormData) {
  const user = await requireUser();
  if (!isAdmin(user.role)) return { ok: false as const, error: 'Apenas admin/gestor.' };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { label, category, color } = parsed.data;
  const slug = slugify(label);

  const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
  if (existing.length) {
    return { ok: false as const, error: `Já existe uma tag "${label}"` };
  }

  await db.insert(tags).values({ label, slug, category, color, isCustom: true, isActive: true });
  revalidatePath('/settings/tags');
  revalidatePath('/opportunities');
  return { ok: true as const };
}

export async function toggleTagActive(formData: FormData) {
  const user = await requireUser();
  if (!isAdmin(user.role)) return { ok: false as const, error: 'Apenas admin/gestor.' };
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return { ok: false as const, error: 'ID inválido' };
  const existing = await db.query.tags.findFirst({ where: eq(tags.id, id) });
  if (!existing) return { ok: false as const, error: 'Tag não encontrada' };
  await db.update(tags).set({ isActive: !existing.isActive }).where(eq(tags.id, id));
  revalidatePath('/settings/tags');
  revalidatePath('/opportunities');
  return { ok: true as const, active: !existing.isActive };
}

export async function deleteTag(formData: FormData) {
  const user = await requireUser();
  if (!isAdmin(user.role)) return { ok: false as const, error: 'Apenas admin/gestor.' };
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return { ok: false as const, error: 'ID inválido' };
  const existing = await db.query.tags.findFirst({ where: eq(tags.id, id) });
  if (!existing) return { ok: false as const, error: 'Tag não encontrada' };
  if (!existing.isCustom) {
    return { ok: false as const, error: 'Tags padrão não podem ser deletadas (use desativar)' };
  }
  await db.delete(tags).where(eq(tags.id, id));
  revalidatePath('/settings/tags');
  revalidatePath('/opportunities');
  return { ok: true as const };
}

/**
 * Acrescenta tags (por LABEL) ao array opportunities.tags sem duplicar.
 * Usado tanto pelo editor (multi-select da taxonomia) quanto pelo auto-tag.
 * Retorna a lista final de tags.
 */
async function appendTagsRaw(opportunityId: number, labels: string[]): Promise<string[]> {
  const clean = labels.map((l) => l.trim()).filter(Boolean);
  if (!clean.length) {
    const cur = await db
      .select({ tags: opportunities.tags })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);
    return (cur[0]?.tags as string[] | null) ?? [];
  }
  // array_cat + dedupe no Postgres pra evitar race read-modify-write.
  const [row] = await db
    .update(opportunities)
    .set({
      tags: sql`(
        SELECT array_agg(DISTINCT t) FROM unnest(
          coalesce(${opportunities.tags}, '{}') || ${clean}::text[]
        ) AS t
      )`,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, opportunityId))
    .returning({ tags: opportunities.tags });
  return (row?.tags as string[] | null) ?? [];
}

/**
 * Auto-tag resiliente por origem. NUNCA lança — encapsula erros para não
 * quebrar a criação da oportunidade. Loga um activity tags_updated.
 */
export async function autoTagOpportunity(
  opportunityId: number,
  labels: string[],
  opts?: { actorId?: string | null },
): Promise<void> {
  try {
    const wanted = labels.map((l) => l.trim()).filter(Boolean);
    if (!wanted.length) return;
    const finalTags = await appendTagsRaw(opportunityId, wanted);
    await logActivity({
      opportunityId,
      type: 'tags_updated',
      subject: 'Tags automáticas (origem)',
      body: wanted.join(', '),
      actorId: opts?.actorId ?? null,
      metadata: { autoTags: wanted, tags: finalTags },
    });
  } catch (err) {
    // Resiliência: falha de auto-tag não pode derrubar a criação.
    console.error(`[autoTagOpportunity] falhou para opp #${opportunityId}:`, err);
  }
}

/**
 * Editor do detalhe: define o conjunto exato de tags da taxonomia escolhidas
 * (multi-select) preservando quaisquer tags free-text que não estão na
 * taxonomia. `taxonomyLabels` = todas as tags válidas da taxonomia (pra saber
 * o que é "gerenciado" vs free-text).
 */
const setTaxonomySchema = z.object({
  id: z.coerce.number().int().positive(),
  // labels selecionados da taxonomia, separados por '\n'
  selected: z.string().optional().default(''),
  // free-text adicional, separado por vírgula
  freeText: z.string().optional().default(''),
});

export async function setOpportunityTaxonomyTags(formData: FormData) {
  const user = await requireUser();
  const parsed = setTaxonomySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { id, selected, freeText } = parsed.data;

  const selectedLabels = selected.split('\n').map((s) => s.trim()).filter(Boolean);
  const freeLabels = freeText.split(',').map((s) => s.trim()).filter(Boolean);

  // Valida que os selecionados existem na taxonomia ativa.
  const taxonomy = await listTags({ activeOnly: true });
  const validLabels = new Set(taxonomy.map((t) => t.label));
  const cleanSelected = selectedLabels.filter((l) => validLabels.has(l));

  const finalTags = Array.from(new Set([...cleanSelected, ...freeLabels])).slice(0, 30);

  await db
    .update(opportunities)
    .set({ tags: finalTags, updatedAt: new Date() })
    .where(eq(opportunities.id, id));

  await logActivity({
    opportunityId: id,
    type: 'tags_updated',
    subject: 'Tags atualizadas',
    body: finalTags.join(', ') || '(nenhuma)',
    actorId: user.id,
    metadata: { tags: finalTags },
  });

  revalidatePath(`/opportunities/${id}`);
  revalidatePath('/opportunities');
  revalidatePath('/pipeline');
  return { ok: true as const, tags: finalTags };
}
