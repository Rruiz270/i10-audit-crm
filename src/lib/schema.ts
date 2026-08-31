import {
  pgSchema,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  date,
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
  uf: varchar('uf', { length: 2 }),
  regiao: text('regiao'),
  // URLs públicas (Vercel Blob) do relatório FUNDEB — enviadas pelo /atende.
  reportUrl: text('report_url'),
  reportResumoUrl: text('report_resumo_url'),
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

// Enriquecimento de prospecção — métricas públicas (FNDE/SIOPE/Censo Escolar)
// por município. Vive no schema `crm` (1:1 com fundeb.municipalities) porque a
// tabela do fundeb pertence ao BNCC-CAPTACAO e não é migrada por este app.
// Guardamos apenas os dados crus; score e valor estimado são derivados em
// leitura (src/lib/prospecting.ts) para a fórmula ter uma única fonte.
export const municipalityProspecting = crmSchema.table('municipality_prospecting', {
  municipalityId: integer('municipality_id')
    .primaryKey()
    .references(() => fundebMunicipalities.id),
  // Ano de referência dos dados importados (ex.: 2025).
  anoReferencia: integer('ano_referencia'),
  // Matrículas da rede municipal (Censo Escolar / FNDE).
  matriculas: integer('matriculas'),
  // Receita anual total do FUNDEB (SIOPE), em R$.
  receitaFundeb: real('receita_fundeb'),
  // Complementações da União recebidas no ano (portarias FNDE), em R$.
  complementacaoVaat: real('complementacao_vaat'),
  complementacaoVaar: real('complementacao_vaar'),
  // Origem dos dados (ex.: 'fnde-vaat-2025.csv') — rastreabilidade do import.
  fonte: text('fonte'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
  // Nº sequencial de "lead ativo" — atribuído quando o lead ganha dono e vira
  // oportunidade. Null enquanto está no pool 'novo'.
  activeNo: integer('active_no'),
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
  // Produto(s) fechados no Ganho — fonte de verdade p/ funil por produto e
  // ramificação do pós-venda (ver src/lib/products.ts).
  products: text('products').array().default([]),
  lostReasonCode: text('lost_reason_code'),
  lastActivityAt: timestamp('last_activity_at').defaultNow(),
  // Data de entrada do lead. Nasce com a oportunidade, mas avança quando outro
  // contato da MESMA cidade engaja — assim a cidade sempre aparece pela última
  // vez que deu sinal, e não pela primeira. É por ela que as telas filtram.
  leadEntradaAt: timestamp('lead_entrada_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tags = crmSchema.table('tags', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  slug: text('slug').unique(),
  // 'origem' | 'produto' | 'outro'
  category: text('category').notNull().default('outro'),
  color: text('color').notNull().default('slate'),
  isActive: boolean('is_active').notNull().default(true),
  isCustom: boolean('is_custom').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
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
  // Ponte de identidade → marketing.contacts (Leads Hub): a MESMA pessoa,
  // independente de quantas opps ela participe. Preenchida no create (via
  // contact-bridge) e por backfill (e-mail exato / últimos 11 dígitos).
  marketingContactId: integer('marketing_contact_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Propostas DENTRO do CRM — registro canônico por oportunidade (nº/versão,
// produtos, status, total). O PDF pode ser gerado no planner (aba embutida),
// mas o dado vive aqui.
export const proposals = crmSchema.table('proposals', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  number: text('number').notNull(),
  version: integer('version').notNull().default(1),
  products: text('products').array().default([]),
  // 'rascunho' | 'enviada' | 'aceita' | 'recusada'
  status: text('status').notNull().default('rascunho'),
  total: real('total'),
  // Itens da proposta: [{ product, value (R$/mês), description? }]
  items: jsonb('items').default([]),
  validDays: integer('valid_days').default(30),
  externalUrl: text('external_url'),
  notes: text('notes'),
  // Link público (capability URL): quem tem o token vê a proposta interativa
  // sem login. Gerado no create (lazy-backfill para propostas antigas).
  publicToken: text('public_token').unique(),
  // Aceite digital feito pelo cliente na página pública.
  acceptedAt: timestamp('accepted_at'),
  acceptedByName: text('accepted_by_name'),
  acceptedByRole: text('accepted_by_role'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tracking da proposta pública: cada abertura vira um evento 'view'; o tempo
// de leitura chega por beacon e é acumulado num evento 'read' por sessão de
// navegação (session_key gerado no client); o aceite registra 'accept'.
export const proposalEvents = crmSchema.table('proposal_events', {
  id: serial('id').primaryKey(),
  proposalId: integer('proposal_id')
    .notNull()
    .references(() => proposals.id, { onDelete: 'cascade' }),
  // 'view' | 'read' | 'accept'
  kind: text('kind').notNull(),
  sessionKey: text('session_key'),
  readSeconds: integer('read_seconds'),
  userAgent: text('user_agent'),
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

// ─── Adoção & uso ──────────────────────────────────────────────────────────
// A sessão do NextAuth é JWT, então `sessions` acima fica vazia e não serve
// como registro de acesso. `access_log` é o log de login de verdade, gravado
// pelo evento signIn (ver ./auth.ts).
//
// ATENÇÃO ao fuso: as colunas `timestamp` do banco não têm timezone e guardam
// UTC (o DEFAULT now() roda com TimeZone=GMT no Neon). Ler direto pelo driver
// engana — ele reinterpreta o valor naive no fuso da máquina. Toda leitura
// orientada a hora local deve converter no SQL:
//   occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'
export const accessLog = crmSchema.table('access_log', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  provider: text('provider'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});

// Snapshot diário por usuário — populado pelo cron /api/cron/usage-snapshot.
// `day` já está em horário de Brasília; `hours` é um array de 24 contagens.
export const usageDaily = crmSchema.table(
  'usage_daily',
  {
    day: date('day').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actions: integer('actions').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    activeMinutes: integer('active_minutes').notNull().default(0),
    logins: integer('logins').notNull().default(0),
    firstAt: timestamp('first_at'),
    lastAt: timestamp('last_at'),
    hours: jsonb('hours').notNull().default([]),
    types: jsonb('types').notNull().default({}),
    computedAt: timestamp('computed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.day, t.userId] })],
);
