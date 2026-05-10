'use server';

import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema-marketing';
import { requireUser, requireRole } from '@/lib/session';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export async function listProjects() {
  const user = await requireUser();
  requireRole(user, ['admin']);
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProject(id: number) {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProject(formData: FormData): Promise<void> {
  const user = await requireUser();
  requireRole(user, ['admin']);
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!name) throw new Error('Nome é obrigatório');

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let attempt = 1;
  while (true) {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const [created] = await db
    .insert(projects)
    .values({
      name,
      slug,
      description,
      status: 'active',
      createdBy: user.id,
    })
    .returning({ id: projects.id });

  revalidatePath('/marketing');
  redirect(`/marketing/${created.id}`);
}
