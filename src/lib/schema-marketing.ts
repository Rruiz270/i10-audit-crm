import {
  pgSchema,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { users, opportunities, contacts as crmContacts } from './schema';

// ─── marketing.* — engine nativa de email + WhatsApp dentro do CRM ─────────
// Convive com `crm.*` (NextAuth + opps) e `fundeb.*` (BNCC). Migrations
// rodam por config separado (drizzle.config.marketing.ts) com schemaFilter
// ['marketing'] para nunca tocar nas tabelas existentes.

export const marketingSchema = pgSchema('marketing');

// Projetos agrupam tudo: 1 projeto = 1 iniciativa de disparo
// (ex: "Webinar FUNDEB Brasil 2026"). Futuros disparos = novos projetos.
export const projects = marketingSchema.table('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  // Status do projeto: draft → active → completed → archived
  status: text('status').notNull().default('draft'),
  // Configuração específica do projeto (override de defaults globais)
  // Ex: { fromEmail, fromName, replyTo, defaultProvider }
  settings: jsonb('settings').notNull().default({}),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Audiências = listas dentro de um projeto. Pode haver múltiplas
// (ex: prefeitos vs secretários), cada uma com seu próprio conjunto de
// contatos via list_members.
export const audiences = marketingSchema.table('audiences', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  // Origem: 'csv_upload' | 'crm_segment' | 'manual'
  source: text('source').notNull(),
  // Snapshot de qual arquivo/segmento gerou a audiência
  sourceMeta: jsonb('source_meta').default({}),
  contactCount: integer('contact_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Contatos globais — mesma pessoa pode estar em N audiências.
// Email é a chave canônica; phone é secundário.
// Cuidado: estes NÃO são `crm.contacts` (que pertencem a 1 opp).
// Podem virar opp via crm-bridge quando inscrição/click acontece.
export const contacts = marketingSchema.table(
  'contacts',
  {
    id: serial('id').primaryKey(),
    email: text('email'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    name: text('name'),
    // Campos derivados de FUNDEB CSV — ficam aqui pra mailmerge sem JOIN
    // a cada envio. Snapshot na importação.
    ibge: varchar('ibge', { length: 7 }),
    municipio: text('municipio'),
    uf: varchar('uf', { length: 2 }),
    role: text('role'), // 'prefeito' | 'secretario' | 'gabinete' | etc
    // Origem do contato (set apenas no INSERT, nunca sobrescrito em upsert):
    // 'csv:<audiência>' | 'webinar:<slug>' | 'form:<slug>' | 'apm' | 'manual'.
    source: text('source'),
    // Atributos arbitrários disponíveis no mailmerge ({{prefeito_nome}}, etc)
    attributes: jsonb('attributes').notNull().default({}),
    // LGPD: base legal usada para contato inicial
    // 'legitimate_interest' | 'consent' | 'contract' | 'legal_obligation'
    lgpdBasis: text('lgpd_basis').notNull().default('legitimate_interest'),
    // Status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
    status: text('status').notNull().default('active'),
    // Link opcional para crm.contacts quando vira lead (post-handoff)
    crmContactId: integer('crm_contact_id').references(() => crmContacts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('mkt_contacts_email_idx').on(t.email),
    index('mkt_contacts_ibge_idx').on(t.ibge),
    index('mkt_contacts_status_idx').on(t.status),
    // Filtros/facetas do Leads Hub a 16k+ contatos.
    index('mkt_contacts_source_idx').on(t.source),
    index('mkt_contacts_uf_idx').on(t.uf),
    index('mkt_contacts_role_idx').on(t.role),
  ],
);

// N:N entre audiences e contacts
export const listMembers = marketingSchema.table(
  'list_members',
  {
    id: serial('id').primaryKey(),
    audienceId: integer('audience_id')
      .notNull()
      .references(() => audiences.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('mkt_list_members_unique').on(t.audienceId, t.contactId),
    index('mkt_list_members_contact_idx').on(t.contactId),
  ],
);

// Templates reutilizáveis dentro de um projeto. Email = HTML; WA = texto.
export const templates = marketingSchema.table('templates', {
  id: serial('id').primaryKey(),
  // Nullable: templates WhatsApp criados no Template Builder são standalone
  // (não pertencem a 1 projeto). Templates de email continuam vinculados.
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  // 'email' | 'whatsapp'
  channel: text('channel').notNull(),
  name: text('name').notNull(),
  // Para email: subject + html. Para WA: body + (opcional) template name aprovado pela Meta
  subject: text('subject'),
  html: text('html'),
  text: text('text'), // versão plaintext do email OR corpo do WhatsApp
  // Se for WA template aprovado pela Meta: Content SID (HX…) + idioma
  waTemplateName: text('wa_template_name'),
  waTemplateLanguage: text('wa_template_language').default('pt_BR'),
  // Categoria Meta (WA): 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  category: text('category'),
  // Botões quick-reply do template WA: [{ id, title }]
  waButtons: jsonb('wa_buttons').default([]),
  // Lista de variáveis esperadas pelo template (validação ao renderizar)
  // Ex: ['ibge', 'municipio', 'prefeito_nome', 'valor_potencial']
  variables: text('variables').array().default([]),
  // 'draft' | 'active' | 'archived'
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Campanha = um disparo concreto de 1 template para 1 audiência.
// Equivale a "E1 (D-14 webinar invite) → audiência prefeitos".
export const campaigns = marketingSchema.table('campaigns', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  audienceId: integer('audience_id')
    .notNull()
    .references(() => audiences.id),
  templateId: integer('template_id')
    .notNull()
    .references(() => templates.id),
  name: text('name').notNull(),
  // 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed'
  status: text('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  // Provider escolhido para esta campanha (override do default do projeto)
  provider: text('provider'), // 'brevo' | 'ses' | 'twilio'
  // Throttle: max envios por minuto desta campanha (separado do limite global)
  ratePerMinute: integer('rate_per_minute').default(120),
  // Stats agregadas (mantidas via trigger ou recalculadas; otimização)
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  deliveredCount: integer('delivered_count').notNull().default(0),
  openCount: integer('open_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),
  // WhatsApp: leituras (wa_read) e respostas únicas (wa_replied, 1 por send).
  // Backfill histórico a partir de marketing.events: scripts/migrate-wa-funnel.mjs
  readCount: integer('read_count').notNull().default(0),
  repliedCount: integer('replied_count').notNull().default(0),
  bounceCount: integer('bounce_count').notNull().default(0),
  unsubscribeCount: integer('unsubscribe_count').notNull().default(0),
  complaintCount: integer('complaint_count').notNull().default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sequência = série ordenada de campanhas com delays entre elas.
// Ex: pre-inscrição (E1 D-14 → E2 D-12 → ... → E7 D-2).
// Membros entram via trigger (audiência inicial OU evento como inscrição).
export const sequences = marketingSchema.table('sequences', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Steps em ordem: [{ campaignId, delayDays, exitOnEvent? }]
  steps: jsonb('steps').notNull().default([]),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sequenceMembers = marketingSchema.table('sequence_members', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id')
    .notNull()
    .references(() => sequences.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  currentStep: integer('current_step').notNull().default(0),
  enrolledAt: timestamp('enrolled_at').defaultNow(),
  nextSendAt: timestamp('next_send_at'),
  exitedAt: timestamp('exited_at'),
  exitReason: text('exit_reason'),
});

// Sends = uma linha por tentativa de envio individual.
// Imutável depois de criada (state evolui via events, não updates).
export const sends = marketingSchema.table(
  'sends',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    // Snapshot do destino no momento do envio (em caso o contact mude depois)
    toEmail: text('to_email'),
    toPhone: text('to_phone'),
    // Snapshot das merge vars usadas — NUNCA recalcular do contact
    mergeVars: jsonb('merge_vars').notNull().default({}),
    // ID retornado pelo provider (Message-ID, MessageSid, etc)
    providerId: text('provider_id'),
    provider: text('provider'),
    // 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'bounced'
    status: text('status').notNull().default('queued'),
    errorMessage: text('error_message'),
    queuedAt: timestamp('queued_at').defaultNow(),
    sentAt: timestamp('sent_at'),
    deliveredAt: timestamp('delivered_at'),
    // Token único usado em todos os tracking links/pixels desta send
    trackingToken: text('tracking_token').notNull().unique(),
  },
  (t) => [
    index('mkt_sends_campaign_idx').on(t.campaignId),
    index('mkt_sends_contact_idx').on(t.contactId),
    index('mkt_sends_status_idx').on(t.status),
  ],
);

// Events = log imutável de tudo que acontece com uma send.
// Open/click/bounce/unsubscribe/wa_delivered/wa_read/wa_replied/etc.
export const events = marketingSchema.table(
  'events',
  {
    id: serial('id').primaryKey(),
    sendId: integer('send_id')
      .notNull()
      .references(() => sends.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    // Tipos:
    //   email: open, click, bounce_hard, bounce_soft, complained, unsubscribed
    //   whatsapp: delivered, read, replied, failed
    //   asset: download
    type: text('type').notNull(),
    // Para clicks: qual link. Para downloads: qual asset. Para replies: o texto.
    payload: jsonb('payload').default({}),
    // Para clicks: a URL final (antes de processarmos). Para opens: User-Agent
    metadata: jsonb('metadata').default({}),
    occurredAt: timestamp('occurred_at').defaultNow(),
  },
  (t) => [
    index('mkt_events_send_idx').on(t.sendId),
    index('mkt_events_contact_idx').on(t.contactId),
    index('mkt_events_type_idx').on(t.type),
    index('mkt_events_occurred_idx').on(t.occurredAt),
  ],
);

// Suppressions globais — checadas antes de QUALQUER envio.
// Email aqui = nunca mais recebe nada de nenhum projeto.
export const suppressions = marketingSchema.table(
  'suppressions',
  {
    id: serial('id').primaryKey(),
    // email lowercase trimmed, ou 'phone:+5511...' para WA
    identifier: text('identifier').notNull(),
    channel: text('channel').notNull(), // 'email' | 'whatsapp'
    // 'unsubscribe' | 'bounce_hard' | 'complaint' | 'manual' | 'lgpd_request'
    reason: text('reason').notNull(),
    // Origem do bloqueio: campaignId, sendId, requestId
    sourceRef: text('source_ref'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('mkt_suppressions_unique').on(t.identifier, t.channel),
    index('mkt_suppressions_reason_idx').on(t.reason),
  ],
);

// Assets = PDFs e arquivos hospedados com tracking de download.
// URL pública = /api/marketing/d/[assetId]?t=[trackingToken] → grava event
// e redireciona para o storage real (Vercel Blob ou URL externa).
export const assets = marketingSchema.table('assets', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // 'pdf' | 'image' | 'video' | 'other'
  kind: text('kind').notNull(),
  // URL final (Vercel Blob, S3, ou URL existente proxiada)
  storageUrl: text('storage_url').notNull(),
  // Tamanho em bytes (informativo)
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  // Quando o asset é por-município (5.569 PDFs), guardamos o template da URL
  // com {{ibge}} pra resolver no momento do envio
  isTemplated: boolean('is_templated').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Consent log = audit trail LGPD imutável.
// Cada opt-in/opt-out/data-request gera 1 linha. Nunca apagar.
export const consentLog = marketingSchema.table(
  'consent_log',
  {
    id: serial('id').primaryKey(),
    contactId: integer('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    // Email/phone copiado pra cá pq contact pode ser deletado por LGPD request
    identifier: text('identifier').notNull(),
    channel: text('channel').notNull(),
    // 'opt_in' | 'opt_out' | 'data_export_request' | 'data_delete_request'
    action: text('action').notNull(),
    // Base legal alegada no momento (snapshot)
    legalBasis: text('legal_basis'),
    // Origem da ação: 'unsubscribe_link' | 'admin_manual' | 'webhook' | 'api'
    source: text('source').notNull(),
    sourceRef: text('source_ref'),
    sourceIp: text('source_ip'),
    userAgent: text('user_agent'),
    // Texto exato mostrado ao usuário no momento (para auditoria)
    consentText: text('consent_text'),
    occurredAt: timestamp('occurred_at').defaultNow(),
  },
  (t) => [
    index('mkt_consent_identifier_idx').on(t.identifier),
    index('mkt_consent_action_idx').on(t.action),
  ],
);

// Queue jobs = trabalho pendente que o cron drena.
// Tipos: 'send_email' | 'send_whatsapp' | 'process_webhook' | 'advance_sequence'
// Padrão: claim com FOR UPDATE SKIP LOCKED para múltiplos workers em paralelo.
export const queueJobs = marketingSchema.table(
  'queue_jobs',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(),
    // Payload específico por tipo. Ex p/ send_email: { sendId }
    payload: jsonb('payload').notNull(),
    // 'pending' | 'claimed' | 'completed' | 'failed' | 'dead'
    status: text('status').notNull().default('pending'),
    runAt: timestamp('run_at').defaultNow(),
    claimedAt: timestamp('claimed_at'),
    completedAt: timestamp('completed_at'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    // Para rate limiting: por qual provider/recurso este job consome cota
    rateBucket: text('rate_bucket'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    index('mkt_queue_status_runat_idx').on(t.status, t.runAt),
    index('mkt_queue_type_idx').on(t.type),
  ],
);

// Webhook log = todo webhook recebido (Brevo, SES SNS, Twilio).
// Útil pra debug + replay quando o handler quebrar.
export const webhookLog = marketingSchema.table('webhook_log', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(), // 'brevo' | 'ses' | 'twilio'
  eventType: text('event_type'),
  rawPayload: jsonb('raw_payload').notNull(),
  // ID da send/event que esse webhook gerou (se sucesso)
  resolvedSendId: integer('resolved_send_id'),
  status: text('status').notNull().default('received'), // 'received' | 'processed' | 'error'
  errorMessage: text('error_message'),
  receivedAt: timestamp('received_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

// CRM bridge log = audit de quando evento marketing virou ação no CRM.
// Ex: inscription webhook → criou opportunity X.
export const crmBridgeLog = marketingSchema.table('crm_bridge_log', {
  id: serial('id').primaryKey(),
  triggerType: text('trigger_type').notNull(), // 'inscription' | 'click' | 'reply'
  triggerSendId: integer('trigger_send_id').references(() => sends.id, {
    onDelete: 'set null',
  }),
  contactId: integer('contact_id').references(() => contacts.id, {
    onDelete: 'set null',
  }),
  // Resultado: { opportunityId, contactId, activityId } criados
  crmAction: text('crm_action').notNull(), // 'opportunity_created' | 'activity_logged' | 'no_action'
  crmRefs: jsonb('crm_refs').notNull().default({}),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Conversas (F2) — inbox WhatsApp de duas vias ──────────────────────────
// 1 número oficial → N conversas (uma por telefone de contato). Inbound chega
// pelo webhook do Twilio (incoming messages) e faz upsert aqui. Escopo de quem
// vê o quê = project_id + (futuro) papel/fila. Trava da janela de 24h via
// windowExpiresAt (último inbound + 24h): fora dela, só template aprovado.
export const conversations = marketingSchema.table(
  'conversations',
  {
    id: serial('id').primaryKey(),
    channel: text('channel').notNull().default('whatsapp'),
    // Telefone do contato (E.164, sem prefixo whatsapp:) — chave do upsert.
    waPhone: text('wa_phone').notNull(),
    contactName: text('contact_name'),
    // Vínculos (todos opcionais — inbound pode vir de número desconhecido)
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    crmContactId: integer('crm_contact_id'),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    opportunityId: integer('opportunity_id'),
    campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    // open | pending | closed
    status: text('status').notNull().default('open'),
    assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    windowExpiresAt: timestamp('window_expires_at'),
    lastMessageAt: timestamp('last_message_at').defaultNow(),
    lastInboundAt: timestamp('last_inbound_at'),
    unread: boolean('unread').notNull().default(true),
    // F2.1 inbox power-ups: notas internas + tags livres por conversa.
    notes: text('notes'),
    tags: text('tags').array().default([]),
    createdAt: timestamp('created_at').defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (t) => [
    uniqueIndex('conversations_channel_phone_uniq').on(t.channel, t.waPhone),
    index('conversations_project_idx').on(t.projectId),
    index('conversations_status_idx').on(t.status),
    index('conversations_assigned_idx').on(t.assignedTo),
  ],
);

// ─── user_projects (F3) — fila por projeto ─────────────────────────────────
// Define quais projetos um usuário "agente" (consultor) pode ver no inbox de
// Conversas. admin/gestor ignoram esta tabela (veem tudo, papel SUPERVISOR).
// Um consultor (AGENTE) vê apenas conversas cujo project_id esteja aqui, mais
// as que estiverem diretamente atribuídas a ele (assigned_to = user.id).
export const userProjects = marketingSchema.table(
  'user_projects',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('mkt_user_projects_unique').on(t.userId, t.projectId),
    index('mkt_user_projects_user_idx').on(t.userId),
    index('mkt_user_projects_project_idx').on(t.projectId),
  ],
);

// ─── canned_responses (F2.1) — respostas rápidas reutilizáveis no inbox ─────
// scope 'global' = disponível em qualquer conversa; 'project' = só conversas do
// projeto referenciado. Inseridas no composer (free-form, editáveis antes de
// enviar). project_id null quando scope='global'.
export const cannedResponses = marketingSchema.table(
  'canned_responses',
  {
    id: serial('id').primaryKey(),
    scope: text('scope').notNull().default('global'), // 'global' | 'project'
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('mkt_canned_scope_project_idx').on(t.scope, t.projectId)],
);

// ─── push_subscriptions (F5) — Web Push do app /atende ─────────────────────
// Cada dispositivo/instalação PWA de um usuário registra uma subscription
// (endpoint + chaves). Ao chegar inbound, disparamos push p/ os subs do dono
// (ou de todos, se a conversa está sem dono). Endpoint é único (upsert por ele).
export const pushSubscriptions = marketingSchema.table(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('push_subs_user_idx').on(t.userId)],
);

export const messages = marketingSchema.table(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    twilioSid: text('twilio_sid'),
    // inbound (do contato) | outbound (do nosso time)
    direction: text('direction').notNull(),
    // Quem enviou (null = o contato/cliente)
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body'),
    mediaUrls: jsonb('media_urls').notNull().default([]),
    isTemplate: boolean('is_template').notNull().default(false),
    templateSid: text('template_sid'),
    // Status de entrega (outbound): queued|sent|delivered|read|failed
    status: text('status'),
    createdAt: timestamp('created_at').defaultNow(),
    // Moderação no CRM (não afeta o que já chegou no WhatsApp do contato):
    // editedAt = marca "editada"; deletedAt = soft-delete (esconde do thread).
    editedAt: timestamp('edited_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);
