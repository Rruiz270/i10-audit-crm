'use server';

import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { ADMIN_ROLES, isAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/session';

const ROLES = ['admin', 'gestor', 'consultor'] as const;

export type TeamRole = (typeof ROLES)[number];

export async function listTeam() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      approvalStatus: users.approvalStatus,
      hasPassword: users.passwordHash,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

const inviteSchema = z.object({
  email: z.string().trim().email('Email inválido').toLowerCase(),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  role: z.enum(ROLES).default('consultor'),
});

export async function inviteMember(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const d = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, d.email),
  });
  if (existing) {
    if (existing.isActive && existing.role === d.role) {
      return { ok: false as const, error: 'Usuário já existe com este role.' };
    }
    // Reativar / atualizar role se já existe
    await db
      .update(users)
      .set({ role: d.role, isActive: true, name: existing.name ?? d.name ?? null })
      .where(eq(users.id, existing.id));
    revalidatePath('/admin/team');
    return { ok: true as const, reactivated: true };
  }

  // Pre-criar o usuário — quando ele logar com Google, signIn() reconhece pelo email.
  // O role = 'consultor' (default) não exige whitelist, mas admin/gestor exigem aprovação.
  await db.insert(users).values({
    id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: d.email,
    name: d.name || null,
    role: d.role,
    isActive: true,
  });
  revalidatePath('/admin/team');
  return { ok: true as const, invited: true };
}

export async function updateMemberRole(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = String(formData.get('id'));
  const role = String(formData.get('role')) as TeamRole;
  if (!(ROLES as readonly string[]).includes(role)) {
    return { ok: false as const, error: 'Role inválido.' };
  }
  if (id === actor.id && role !== 'admin') {
    return { ok: false as const, error: 'Você não pode rebaixar seu próprio perfil.' };
  }
  await db.update(users).set({ role }).where(eq(users.id, id));
  revalidatePath('/admin/team');
  return { ok: true as const };
}

export async function toggleMemberActive(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = String(formData.get('id'));
  if (id === actor.id) {
    return { ok: false as const, error: 'Você não pode desativar a si mesmo.' };
  }
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) return { ok: false as const, error: 'Usuário não encontrado.' };
  await db.update(users).set({ isActive: !u.isActive }).where(eq(users.id, id));
  revalidatePath('/admin/team');
  return { ok: true as const, active: !u.isActive };
}

// Nota: ADMIN_ROLES e ROLES (arrays constantes) NÃO podem ser exportados
// daqui porque arquivos marcados com 'use server' só exportam async functions
// (viram RPC endpoints). Importe ADMIN_ROLES direto de '@/lib/roles' se precisar.
