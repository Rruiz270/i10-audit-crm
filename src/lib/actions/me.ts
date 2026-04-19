'use server';

import { and, count, desc, eq, gte, sql as drSql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  activities,
  contacts,
  opportunities,
  tasks,
  userPreferences,
  users,
} from '@/lib/schema';
import { requireUser } from '@/lib/session';

export type UserPreferences = {
  notificationsEnabled: boolean;
  notifyTaskOverdue: boolean;
  notifyNewLead: boolean;
  notifyHandoffKickoff: boolean;
  notifyBnccSignals: boolean;
  defaultPipelineFilter: 'all' | 'mine';
  timezone: string;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  displayCompact: boolean;
};

const DEFAULT_PREFS: UserPreferences = {
  notificationsEnabled: true,
  notifyTaskOverdue: true,
  notifyNewLead: true,
  notifyHandoffKickoff: true,
  notifyBnccSignals: true,
  defaultPipelineFilter: 'all',
  timezone: 'America/Sao_Paulo',
  workingHoursStart: null,
  workingHoursEnd: null,
  displayCompact: false,
};

/**
 * Lê as preferências do usuário atual (auto-seeda se não existir).
 * Server-only — leia no top dos layouts/pages que precisam.
 */
export async function getMyPreferences(userId?: string): Promise<UserPreferences> {
  const id = userId ?? (await requireUser()).id;
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, id),
  });
  if (!row) {
    return DEFAULT_PREFS;
  }
  return {
    notificationsEnabled: row.notificationsEnabled,
    notifyTaskOverdue: row.notifyTaskOverdue,
    notifyNewLead: row.notifyNewLead,
    notifyHandoffKickoff: row.notifyHandoffKickoff,
    notifyBnccSignals: row.notifyBnccSignals,
    defaultPipelineFilter:
      row.defaultPipelineFilter === 'mine' ? 'mine' : 'all',
    timezone: row.timezone,
    workingHoursStart: row.workingHoursStart,
    workingHoursEnd: row.workingHoursEnd,
    displayCompact: row.displayCompact,
  };
}

const prefsSchema = z.object({
  notificationsEnabled: z.string().optional(),
  notifyTaskOverdue: z.string().optional(),
  notifyNewLead: z.string().optional(),
  notifyHandoffKickoff: z.string().optional(),
  notifyBnccSignals: z.string().optional(),
  defaultPipelineFilter: z.enum(['all', 'mine']).default('all'),
  timezone: z.string().trim().max(64).default('America/Sao_Paulo'),
  workingHoursStart: z.string().trim().max(10).optional().or(z.literal('')),
  workingHoursEnd: z.string().trim().max(10).optional().or(z.literal('')),
  displayCompact: z.string().optional(),
});

export async function updateMyPreferences(formData: FormData) {
  const user = await requireUser();
  const parsed = prefsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const d = parsed.data;
  const toBool = (v: unknown) => v === 'on' || v === 'true';
  const values = {
    userId: user.id,
    notificationsEnabled: toBool(d.notificationsEnabled),
    notifyTaskOverdue: toBool(d.notifyTaskOverdue),
    notifyNewLead: toBool(d.notifyNewLead),
    notifyHandoffKickoff: toBool(d.notifyHandoffKickoff),
    notifyBnccSignals: toBool(d.notifyBnccSignals),
    defaultPipelineFilter: d.defaultPipelineFilter,
    timezone: d.timezone,
    workingHoursStart: d.workingHoursStart || null,
    workingHoursEnd: d.workingHoursEnd || null,
    displayCompact: toBool(d.displayCompact),
    updatedAt: new Date(),
  };
  // Upsert via INSERT ... ON CONFLICT DO UPDATE
  await db
    .insert(userPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        notificationsEnabled: values.notificationsEnabled,
        notifyTaskOverdue: values.notifyTaskOverdue,
        notifyNewLead: values.notifyNewLead,
        notifyHandoffKickoff: values.notifyHandoffKickoff,
        notifyBnccSignals: values.notifyBnccSignals,
        defaultPipelineFilter: values.defaultPipelineFilter,
        timezone: values.timezone,
        workingHoursStart: values.workingHoursStart,
        workingHoursEnd: values.workingHoursEnd,
        displayCompact: values.displayCompact,
        updatedAt: values.updatedAt,
      },
    });
  revalidatePath('/me/preferences');
  revalidatePath('/');
  return { ok: true as const };
}

const profileSchema = z.object({
  displayName: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  signature: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const d = parsed.data;
  await db
    .update(users)
    .set({
      displayName: d.displayName || null,
      phone: d.phone || null,
      signature: d.signature || null,
    })
    .where(eq(users.id, user.id));
  revalidatePath('/me');
  return { ok: true as const };
}

/**
 * Stats pessoais — usado no Dashboard + /me.
 */
export async function getMyStats(userId: string) {
  const since30 = new Date(Date.now() - 30 * 24 * 3600_000);

  const [myOps] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(eq(opportunities.ownerId, userId));

  const [myActive] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.ownerId, userId),
        drSql`${opportunities.stage} NOT IN ('ganhou','perdido')`,
      ),
    );

  const [myWon30] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.ownerId, userId),
        eq(opportunities.stage, 'ganhou'),
        gte(opportunities.wonAt, since30),
      ),
    );

  const [myLost30] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.ownerId, userId),
        eq(opportunities.stage, 'perdido'),
        gte(opportunities.lostAt, since30),
      ),
    );

  const [myTasks] = await db
    .select({ n: count() })
    .from(tasks)
    .where(
      and(eq(tasks.assignedTo, userId), drSql`${tasks.completedAt} IS NULL`),
    );

  const [myContacts] = await db
    .select({ n: count() })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id))
    .where(eq(opportunities.ownerId, userId));

  const myActivitiesRecent = await db
    .select({ n: count() })
    .from(activities)
    .where(
      and(eq(activities.actorId, userId), gte(activities.occurredAt, since30)),
    );

  const wonN = Number(myWon30?.n ?? 0);
  const lostN = Number(myLost30?.n ?? 0);
  const winRate30 = wonN + lostN > 0 ? wonN / (wonN + lostN) : 0;

  return {
    totalOps: Number(myOps?.n ?? 0),
    activeOps: Number(myActive?.n ?? 0),
    won30: wonN,
    lost30: lostN,
    winRate30,
    openTasks: Number(myTasks?.n ?? 0),
    contacts: Number(myContacts?.n ?? 0),
    activities30: Number(myActivitiesRecent[0]?.n ?? 0),
  };
}

export async function getMyActiveOpportunitiesForForecast(userId: string) {
  return db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      lastActivityAt: opportunities.lastActivityAt,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.ownerId, userId),
        drSql`${opportunities.stage} NOT IN ('ganhou','perdido')`,
      ),
    )
    .orderBy(desc(opportunities.updatedAt));
}

/** Return the user's profile data + the session user's role/id */
export async function getMyProfile(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return null;
  return u;
}
