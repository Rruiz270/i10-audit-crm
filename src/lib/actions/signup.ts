'use server';

import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { isAdmin, requireUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(8, 'Senha precisa ter pelo menos 8 caracteres').max(128),
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
});

/**
 * Auto-cadastro do consultor. Cria com `is_active=true, approval_status='pending'`
 * — o login fica bloqueado até admin aprovar via /admin/team.
 */
export async function signupConsultor(
  formData: FormData,
): Promise<
  { ok: true; pending: true } | { ok: false; error: string }
> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { email, password, name } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    if (existing.approvalStatus === 'pending') {
      return {
        ok: false,
        error: 'Este email já está na fila aguardando aprovação.',
      };
    }
    if (existing.approvalStatus === 'rejected') {
      return {
        ok: false,
        error: 'Este cadastro foi rejeitado. Procure um admin do time.',
      };
    }
    return { ok: false, error: 'Este email já possui conta — use "Entrar".' };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    id: `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    role: 'consultor',
    isActive: true,
    approvalStatus: 'pending',
    passwordHash,
  });

  revalidatePath('/admin/team');
  return { ok: true, pending: true };
}

const adminCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'gestor', 'consultor']).default('consultor'),
});

/**
 * Admin cria usuário direto (sem pending) — bypassa o flow de aprovação.
 * Usado para criar gestores/admins pré-aprovados.
 */
export async function adminCreateUser(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const parsed = adminCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { email, name, password, role } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    // Atualiza senha + role + aprova
    await db
      .update(users)
      .set({
        name: existing.name ?? name,
        role,
        isActive: true,
        approvalStatus: 'approved',
        passwordHash,
      })
      .where(eq(users.id, existing.id));
    revalidatePath('/admin/team');
    return { ok: true as const, updated: true };
  }

  await db.insert(users).values({
    id: `admin-created-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    role,
    isActive: true,
    approvalStatus: 'approved',
    passwordHash,
  });

  revalidatePath('/admin/team');
  return { ok: true as const, created: true };
}

export async function approveMember(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = String(formData.get('id'));
  if (!id) return { ok: false as const, error: 'id obrigatório' };
  await db
    .update(users)
    .set({ approvalStatus: 'approved', isActive: true })
    .where(eq(users.id, id));
  revalidatePath('/admin/team');
  return { ok: true as const };
}

export async function rejectMember(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = String(formData.get('id'));
  if (!id) return { ok: false as const, error: 'id obrigatório' };
  await db
    .update(users)
    .set({ approvalStatus: 'rejected', isActive: false })
    .where(eq(users.id, id));
  revalidatePath('/admin/team');
  return { ok: true as const };
}

export async function resetMemberPassword(formData: FormData) {
  const actor = await requireUser();
  if (!isAdmin(actor.role)) {
    return { ok: false as const, error: 'Apenas admin/gestor.' };
  }
  const id = String(formData.get('id'));
  const newPassword = String(formData.get('password') ?? '');
  if (!newPassword || newPassword.length < 8) {
    return { ok: false as const, error: 'Senha precisa ter ao menos 8 caracteres' };
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, id));
  revalidatePath('/admin/team');
  return { ok: true as const };
}
