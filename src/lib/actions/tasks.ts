'use server';

import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  fundebMunicipalities,
  opportunities,
  tasks,
  users,
} from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

const createSchema = z.object({
  opportunityId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2, 'Título muito curto').max(200),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  dueAt: z.string().min(5, 'Data/hora inválida'),
  assignedTo: z.string().trim().optional().or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const data = parsed.data;
  const dueAt = new Date(data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return { ok: false as const, error: 'Data/hora inválida' };
  }

  const [row] = await db
    .insert(tasks)
    .values({
      opportunityId: data.opportunityId,
      title: data.title,
      description: data.description || null,
      dueAt,
      assignedTo: data.assignedTo || user.id,
      createdBy: user.id,
      priority: data.priority,
    })
    .returning({ id: tasks.id });

  await logActivity({
    opportunityId: data.opportunityId,
    type: 'task_created',
    subject: data.title,
    body: `Vence em ${dueAt.toLocaleString('pt-BR')}`,
    actorId: user.id,
    metadata: { taskId: row.id, priority: data.priority },
  });

  revalidatePath(`/opportunities/${data.opportunityId}`);
  revalidatePath('/tasks');
  revalidatePath('/');
  return { ok: true as const, id: row.id };
}

export async function completeTask(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get('id'));
  if (!Number.isFinite(taskId)) return { ok: false as const, error: 'ID inválido' };

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { ok: false as const, error: 'Tarefa não encontrada' };
  if (existing.completedAt) {
    // Undo: reopen
    await db.update(tasks).set({ completedAt: null }).where(eq(tasks.id, taskId));
    await logActivity({
      opportunityId: existing.opportunityId,
      type: 'note',
      subject: `Tarefa reaberta: ${existing.title}`,
      actorId: user.id,
      metadata: { taskId },
    });
  } else {
    await db.update(tasks).set({ completedAt: new Date() }).where(eq(tasks.id, taskId));
    await logActivity({
      opportunityId: existing.opportunityId,
      type: 'task_completed',
      subject: `Tarefa concluída: ${existing.title}`,
      actorId: user.id,
      metadata: { taskId },
    });
  }

  revalidatePath(`/opportunities/${existing.opportunityId}`);
  revalidatePath('/tasks');
  revalidatePath('/');
  return { ok: true as const };
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get('id'));
  const opportunityId = Number(formData.get('opportunityId'));
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await logActivity({
    opportunityId,
    type: 'note',
    subject: 'Tarefa removida',
    actorId: user.id,
    metadata: { taskId },
  });
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath('/tasks');
  return { ok: true as const };
}

export async function listTasksForOpportunity(opportunityId: number) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      priority: tasks.priority,
      assignedTo: tasks.assignedTo,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedTo, users.id))
    .where(eq(tasks.opportunityId, opportunityId))
    .orderBy(asc(tasks.completedAt), asc(tasks.dueAt));
}

export async function listMyOpenTasks(userId: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      opportunityId: tasks.opportunityId,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(tasks)
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(and(eq(tasks.assignedTo, userId), isNull(tasks.completedAt)))
    .orderBy(asc(tasks.dueAt))
    .limit(200);
}

export async function listOverdueTasks(now: Date = new Date()) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      opportunityId: tasks.opportunityId,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedTo, users.id))
    .where(and(isNull(tasks.completedAt), lte(tasks.dueAt, now)))
    .orderBy(asc(tasks.dueAt))
    .limit(500);
}

export async function listAllTasks(filter?: { mine?: string }) {
  const cond = filter?.mine
    ? and(eq(tasks.assignedTo, filter.mine), isNull(tasks.completedAt))
    : undefined;
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      priority: tasks.priority,
      opportunityId: tasks.opportunityId,
      assigneeName: users.name,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedTo, users.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .where(cond)
    .orderBy(desc(tasks.dueAt))
    .limit(500);
}
