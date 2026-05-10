'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, requireRole } from '@/lib/session';
import { sendInsightEmail } from '@/lib/insights/email';

// Aprova um draft pending → cria registro em insights.articles +
// muda status do draft pra 'published'.
// Próxima publicação envia para todos subscribers confirmados.

export async function approveDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('id required');

  const sql = neon(process.env.DATABASE_URL!);

  // Carrega o draft pra copiar pra articles
  const drafts = await sql`SELECT * FROM insights.drafts WHERE id = ${id} LIMIT 1`;
  if (drafts.length === 0) throw new Error('draft not found');
  const d = drafts[0];

  if (d.status !== 'pending') {
    throw new Error(`draft já está em status ${d.status}`);
  }

  // Insert em articles (mesmo id que draft)
  await sql`
    INSERT INTO insights.articles (
      id, draft_id, category,
      title_pt, title_en, slug_pt, slug_en,
      excerpt_pt, excerpt_en, body_pt, body_en,
      hero_image_url, hero_image_alt_pt, hero_image_alt_en,
      citations, video_url, video_aspect_ratio
    ) VALUES (
      ${d.id}, ${d.id}, ${d.category},
      ${d.title_pt}, ${d.title_en}, ${d.slug_pt}, ${d.slug_en},
      ${d.excerpt_pt}, ${d.excerpt_en}, ${d.body_pt}, ${d.body_en},
      ${d.hero_image_url}, ${d.hero_image_alt_pt}, ${d.hero_image_alt_en},
      ${JSON.stringify(d.citations)}::jsonb, ${d.video_url}, ${d.video_aspect_ratio}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // Mark draft as published
  await sql`
    UPDATE insights.drafts
    SET status = 'published',
        approved_by = ${user.email},
        approved_at = NOW()
    WHERE id = ${id}
  `;

  revalidatePath('/insights');
  revalidatePath('/insights/drafts');
  redirect('/insights/drafts');
}

export async function rejectDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!id) throw new Error('id required');

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE insights.drafts
    SET status = 'rejected',
        rejection_reason = ${reason},
        approved_by = ${user.email}
    WHERE id = ${id}
  `;
  revalidatePath('/insights');
  revalidatePath('/insights/drafts');
  redirect('/insights/drafts');
}
