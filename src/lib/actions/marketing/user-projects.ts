'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { userProjects, projects } from '@/lib/schema-marketing';
import { requireUser } from '@/lib/session';
import { isAdmin } from '@/lib/roles';

// ─── F3 — gestão de filas por projeto (admin/gestor) ───────────────────────
// Define quais projetos cada usuário "agente" pode ver no inbox de Conversas.

export type ProjectOption = { id: number; name: string };
export type MembershipRow = { userId: string; projectId: number };

// Lista projetos disponíveis para atribuição (apenas admin/gestor).
export async function listAssignableProjects(): Promise<ProjectOption[]> {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) throw new Error('FORBIDDEN');
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);
  return rows;
}

// Todas as memberships (para montar a matriz usuário × projeto no admin).
export async function listAllMemberships(): Promise<MembershipRow[]> {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) throw new Error('FORBIDDEN');
  return db
    .select({ userId: userProjects.userId, projectId: userProjects.projectId })
    .from(userProjects);
}

export async function addUserProject(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) return { ok: false as const, error: 'Apenas admin/gestor.' };
  const userId = String(formData.get('userId') ?? '');
  const projectId = Number(formData.get('projectId'));
  if (!userId || !projectId) return { ok: false as const, error: 'Dados inválidos.' };

  // Idempotente: unique(userId, projectId) garante que não duplica.
  await db
    .insert(userProjects)
    .values({ userId, projectId })
    .onConflictDoNothing({ target: [userProjects.userId, userProjects.projectId] });
  revalidatePath('/admin/team');
  return { ok: true as const };
}

export async function removeUserProject(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) return { ok: false as const, error: 'Apenas admin/gestor.' };
  const userId = String(formData.get('userId') ?? '');
  const projectId = Number(formData.get('projectId'));
  if (!userId || !projectId) return { ok: false as const, error: 'Dados inválidos.' };

  await db
    .delete(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.projectId, projectId)));
  revalidatePath('/admin/team');
  return { ok: true as const };
}
