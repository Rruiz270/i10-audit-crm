'use server';

import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { meetings, opportunities, fundebMunicipalities, contacts } from '@/lib/schema';
import { requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';
import { createCalendarEvent } from '@/lib/google-calendar';

const createSchema = z.object({
  opportunityId: z.coerce.number().int().positive(),
  title: z.string().trim().max(200).optional().or(z.literal('')),
  kind: z.enum([
    'contato_inicial',
    'diagnostico',
    'reuniao_auditoria',
    'negociacao',
    'follow_up',
    'outra',
  ]),
  scheduledAt: z.string().min(5, 'Data/hora inválida'),
  durationMinutes: z.coerce.number().int().min(10).max(480).default(30),
  location: z.string().trim().max(300).optional().or(z.literal('')),
  addMeet: z.string().optional(),
  sendCalendar: z.string().optional(),
  attendeesCsv: z.string().trim().max(1000).optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
});

export async function createMeeting(formData: FormData) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const data = parsed.data;
  const scheduledAt = new Date(data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false as const, error: 'Data/hora inválida' };
  }
  const end = new Date(scheduledAt.getTime() + data.durationMinutes * 60_000);
  const addMeet = data.addMeet === 'on' || data.addMeet === 'true';
  const sendCalendar = data.sendCalendar === 'on' || data.sendCalendar === 'true';

  const attendees = (data.attendeesCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
    .map((email) => ({ email }));

  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;
  let meetLink: string | null = null;
  let calendarError: string | null = null;

  if (sendCalendar) {
    try {
      const created = await createCalendarEvent(user.id, {
        summary: data.title || 'Reunião i10 CRM',
        description: data.notes || undefined,
        start: scheduledAt,
        end,
        attendees,
        addMeet,
      });
      googleEventId = created.eventId;
      googleCalendarId = created.calendarId;
      meetLink = created.meetLink ?? null;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : 'Falha ao criar evento no Calendar';
    }
  }

  const [created] = await db
    .insert(meetings)
    .values({
      opportunityId: data.opportunityId,
      title: data.title || null,
      kind: data.kind,
      scheduledAt,
      durationMinutes: data.durationMinutes,
      location: data.location || null,
      meetLink,
      googleEventId,
      googleCalendarId,
      attendees,
      notes: data.notes || null,
      createdBy: user.id,
    })
    .returning({ id: meetings.id });

  await logActivity({
    opportunityId: data.opportunityId,
    type: 'note',
    subject: `Reunião agendada: ${data.title ?? data.kind}`,
    body: `${scheduledAt.toLocaleString('pt-BR')}${meetLink ? `\nLink: ${meetLink}` : ''}${calendarError ? `\n⚠️ ${calendarError}` : ''}`,
    actorId: user.id,
    metadata: { meetingId: created.id, googleEventId },
  });

  revalidatePath(`/opportunities/${data.opportunityId}`);
  revalidatePath('/meetings');
  return { ok: true as const, id: created.id, calendarError };
}

export async function markMeetingDone(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  const opportunityId = Number(formData.get('opportunityId'));
  const outcome = formData.get('outcome')?.toString() ?? 'done';
  await db
    .update(meetings)
    .set({ completedAt: new Date(), outcome })
    .where(eq(meetings.id, id));
  await logActivity({
    opportunityId,
    type: 'note',
    subject: 'Reunião concluída',
    body: outcome,
    actorId: user.id,
    metadata: { meetingId: id },
  });
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath('/meetings');
  return { ok: true as const };
}

export async function listAllMeetings() {
  return db
    .select({
      id: meetings.id,
      title: meetings.title,
      kind: meetings.kind,
      scheduledAt: meetings.scheduledAt,
      durationMinutes: meetings.durationMinutes,
      meetLink: meetings.meetLink,
      googleEventId: meetings.googleEventId,
      completedAt: meetings.completedAt,
      opportunityId: meetings.opportunityId,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(meetings)
    .leftJoin(opportunities, eq(meetings.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .orderBy(desc(meetings.scheduledAt))
    .limit(200);
}

export async function suggestMeetingAttendees(opportunityId: number) {
  const rows = await db
    .select({ email: contacts.email, name: contacts.name })
    .from(contacts)
    .where(eq(contacts.opportunityId, opportunityId));
  return rows.filter((r) => r.email);
}
