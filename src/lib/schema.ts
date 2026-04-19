import {
  pgSchema,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  varchar,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const crmSchema = pgSchema('crm');
export const fundebSchema = pgSchema('fundeb');

// ─── Read-only reference into BNCC-CAPTACAO's municipalities ──────────────
// We only model the columns we join against — the full table lives in the
// other app's schema file and is the source of truth.
export const fundebMunicipalities = fundebSchema.table('municipalities', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  codigoIbge: varchar('codigo_ibge', { length: 7 }).unique(),
  regiao: text('regiao'),
});

export const fundebConsultorias = fundebSchema.table('consultorias', {
  id: serial('id').primaryKey(),
  municipalityId: integer('municipality_id'),
  status: text('status'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  consultantName: text('consultant_name'),
  secretaryName: text('secretary_name'),
  annotations: text('annotations'),
});

// ─── CRM core ──────────────────────────────────────────────────────────────

export const users = crmSchema.table('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  role: text('role').notNull().default('consultor'),
  googleRefreshToken: text('google_refresh_token'),
  isActive: boolean('is_active').default(true),
  // Autenticação por email+senha (bcrypt hash) — permite login sem Google
  passwordHash: text('password_hash'),
  // 'pending' | 'approved' | 'rejected' — auto-signups ficam pending até aprovação
  approvalStatus: text('approval_status').notNull().default('approved'),
  // Overrides pessoais — editáveis em /me (sobrescreve o que vem do Google)
  displayName: text('display_name'),
  phone: text('phone'),
  signature: text('signature'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userPreferences = crmSchema.table('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  notifyTaskOverdue: boolean('notify_task_overdue').notNull().default(true),
  notifyNewLead: boolean('notify_new_lead').notNull().default(true),
  notifyHandoffKickoff: boolean('notify_handoff_kickoff').notNull().default(true),
  notifyBnccSignals: boolean('notify_bncc_signals').notNull().default(true),
  defaultPipelineFilter: text('default_pipeline_filter').notNull().default('all'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  workingHoursStart: text('working_hours_start'),
  workingHoursEnd: text('working_hours_end'),
  displayCompact: boolean('display_compact').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const opportunities = crmSchema.table('opportunities', {
  id: serial('id').primaryKey(),
  municipalityId: integer('municipality_id').references(() => fundebMunicipalities.id),
  ownerId: text('owner_id').references(() => users.id),
  stage: text('stage').notNull().default('novo'),
  stageUpdatedAt: timestamp('stage_updated_at').defaultNow(),
  source: text('source'),
  estimatedValue: real('estimated_value'),
  closeDate: timestamp('close_date'),
  contractSigned: boolean('contract_signed').default(false),
  contractNotes: text('contract_notes'),
  wonAt: timestamp('won_at'),
  lostAt: timestamp('lost_at'),
  lostReason: text('lost_reason'),
  handedOffConsultoriaId: integer('handed_off_consultoria_id').references(
    () => fundebConsultorias.id,
  ),
  handedOffAt: timestamp('handed_off_at'),
  notes: text('notes'),
  tags: text('tags').array().default([]),
  lostReasonCode: text('lost_reason_code'),
  lastActivityAt: timestamp('last_activity_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const pipelineStages = crmSchema.table('pipeline_stages', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  color: text('color').notNull().default('slate-500'),
  order: integer('order').notNull(),
  probability: real('probability').notNull().default(0.5),
  rotDays: integer('rot_days'),
  isTerminal: boolean('is_terminal').notNull().default(false),
  isWon: boolean('is_won').notNull().default(false),
  isCustom: boolean('is_custom').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tasks = crmSchema.table('tasks', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  dueAt: timestamp('due_at').notNull(),
  completedAt: timestamp('completed_at'),
  assignedTo: text('assigned_to').references(() => users.id),
  createdBy: text('created_by').references(() => users.id),
  priority: text('priority').notNull().default('normal'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const contacts = crmSchema.table('contacts', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  isPrimary: boolean('is_primary').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const activities = crmSchema.table('activities', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  subject: text('subject'),
  body: text('body'),
  occurredAt: timestamp('occurred_at').defaultNow(),
  actorId: text('actor_id').references(() => users.id),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const meetings = crmSchema.table('meetings', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  title: text('title'),
  kind: text('kind').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').default(30),
  location: text('location'),
  meetLink: text('meet_link'),
  googleEventId: text('google_event_id'),
  googleCalendarId: text('google_calendar_id'),
  attendees: jsonb('attendees').default([]),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  outcome: text('outcome'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leadForms = crmSchema.table('lead_forms', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  fieldsSchema: jsonb('fields_schema').notNull().default([]),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leadSubmissions = crmSchema.table('lead_submissions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id').references(() => leadForms.id),
  payload: jsonb('payload').notNull(),
  sourceIp: text('source_ip'),
  userAgent: text('user_agent'),
  opportunityId: integer('opportunity_id').references(() => opportunities.id),
  triaged: boolean('triaged').default(false),
  triagedBy: text('triaged_by').references(() => users.id),
  triagedAt: timestamp('triaged_at'),
  submittedAt: timestamp('submitted_at').defaultNow(),
});

// ─── NextAuth tables (Drizzle adapter standard) ────────────────────────────

export const accounts = crmSchema.table(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = crmSchema.table('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = crmSchema.table(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
