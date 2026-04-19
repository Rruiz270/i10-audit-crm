import { google } from 'googleapis';
import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { accounts } from './schema';

export type CalendarEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: Array<{ email: string; displayName?: string }>;
  addMeet?: boolean;
  calendarId?: string;
};

export type CalendarEventCreated = {
  eventId: string;
  calendarId: string;
  htmlLink?: string;
  meetLink?: string;
};

async function getGoogleTokensForUser(userId: string) {
  const row = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
    .limit(1);
  return row[0] ?? null;
}

function buildOAuthClient(refreshToken: string | null, accessToken: string | null) {
  const clientId =
    process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret =
    process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '';
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    refresh_token: refreshToken ?? undefined,
    access_token: accessToken ?? undefined,
  });
  return oauth2;
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEventCreated> {
  const tokens = await getGoogleTokensForUser(userId);
  if (!tokens) {
    throw new Error('Usuário sem conta Google vinculada.');
  }
  if (!tokens.refresh_token) {
    throw new Error(
      'Conta Google sem refresh_token — reconecte em /api/auth/signin com consent.',
    );
  }

  const oauth2 = buildOAuthClient(tokens.refresh_token, tokens.access_token);
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const calendarId = input.calendarId ?? 'primary';

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: input.addMeet ? 1 : undefined,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: input.end.toISOString(), timeZone: 'America/Sao_Paulo' },
      attendees: input.attendees,
      conferenceData: input.addMeet
        ? {
            createRequest: {
              requestId: `i10-crm-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          }
        : undefined,
    },
  });

  const data = response.data;
  const meetLink =
    data.hangoutLink ?? data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

  return {
    eventId: data.id!,
    calendarId,
    htmlLink: data.htmlLink ?? undefined,
    meetLink: meetLink ?? undefined,
  };
}
