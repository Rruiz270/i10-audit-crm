'use server';

import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { assets } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';

export async function listAssets(projectId: number) {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  return db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(desc(assets.createdAt));
}

// Cria asset apontando pra URL externa (sem upload de arquivo).
// Pra MVP: assumimos que PDFs já estão em institutoi10.com.br/fundeb-2026/...
// e só registramos o pointer + tracking. Upload pra Vercel Blob fica pra fase posterior.
export async function createAsset(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin', 'gestor']);
  const projectId = Number(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'pdf');
  const storageUrl = String(formData.get('storageUrl') ?? '').trim();
  const isTemplated = formData.get('isTemplated') === '1';

  if (!projectId || !name || !storageUrl) {
    throw new Error('projectId, name, storageUrl obrigatórios');
  }

  await db.insert(assets).values({
    projectId,
    name,
    kind,
    storageUrl,
    isTemplated,
  });

  revalidatePath(`/marketing/${projectId}/assets`);
  redirect(`/marketing/${projectId}/assets`);
}
