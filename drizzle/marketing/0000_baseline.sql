CREATE SCHEMA "marketing";
--> statement-breakpoint
CREATE TABLE "marketing"."assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"storage_url" text NOT NULL,
	"size_bytes" integer,
	"mime_type" text,
	"is_templated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."audiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source" text NOT NULL,
	"source_meta" jsonb DEFAULT '{}'::jsonb,
	"contact_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"audience_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"provider" text,
	"rate_per_minute" integer DEFAULT 120,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"bounce_count" integer DEFAULT 0 NOT NULL,
	"unsubscribe_count" integer DEFAULT 0 NOT NULL,
	"complaint_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."canned_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"project_id" integer,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."consent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"identifier" text NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"legal_basis" text,
	"source" text NOT NULL,
	"source_ref" text,
	"source_ip" text,
	"user_agent" text,
	"consent_text" text,
	"occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"name" text,
	"ibge" varchar(7),
	"municipio" text,
	"uf" varchar(2),
	"role" text,
	"source" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lgpd_basis" text DEFAULT 'legitimate_interest' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"crm_contact_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"wa_phone" text NOT NULL,
	"contact_name" text,
	"contact_id" integer,
	"crm_contact_id" integer,
	"project_id" integer,
	"opportunity_id" integer,
	"campaign_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"window_expires_at" timestamp,
	"last_message_at" timestamp DEFAULT now(),
	"last_inbound_at" timestamp,
	"unread" boolean DEFAULT true NOT NULL,
	"notes" text,
	"tags" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "marketing"."crm_bridge_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_send_id" integer,
	"contact_id" integer,
	"crm_action" text NOT NULL,
	"crm_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."events" (
	"id" serial PRIMARY KEY NOT NULL,
	"send_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."list_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"audience_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"twilio_sid" text,
	"direction" text NOT NULL,
	"author_user_id" text,
	"body" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_sid" text,
	"status" text,
	"created_at" timestamp DEFAULT now(),
	"edited_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "marketing"."projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketing"."push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "marketing"."queue_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_at" timestamp DEFAULT now(),
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"rate_bucket" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"to_email" text,
	"to_phone" text,
	"merge_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_id" text,
	"provider" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"queued_at" timestamp DEFAULT now(),
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"tracking_token" text NOT NULL,
	CONSTRAINT "sends_tracking_token_unique" UNIQUE("tracking_token")
);
--> statement-breakpoint
CREATE TABLE "marketing"."sequence_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp DEFAULT now(),
	"next_send_at" timestamp,
	"exited_at" timestamp,
	"exit_reason" text
);
--> statement-breakpoint
CREATE TABLE "marketing"."sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"channel" text NOT NULL,
	"reason" text NOT NULL,
	"source_ref" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"channel" text NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"html" text,
	"text" text,
	"wa_template_name" text,
	"wa_template_language" text DEFAULT 'pt_BR',
	"category" text,
	"wa_buttons" jsonb DEFAULT '[]'::jsonb,
	"variables" text[] DEFAULT '{}',
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."user_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing"."webhook_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text,
	"raw_payload" jsonb NOT NULL,
	"resolved_send_id" integer,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "marketing"."assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."audiences" ADD CONSTRAINT "audiences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."campaigns" ADD CONSTRAINT "campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."campaigns" ADD CONSTRAINT "campaigns_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "marketing"."audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."campaigns" ADD CONSTRAINT "campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "marketing"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."canned_responses" ADD CONSTRAINT "canned_responses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."canned_responses" ADD CONSTRAINT "canned_responses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."consent_log" ADD CONSTRAINT "consent_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."contacts" ADD CONSTRAINT "contacts_crm_contact_id_contacts_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "crm"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."conversations" ADD CONSTRAINT "conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "crm"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."crm_bridge_log" ADD CONSTRAINT "crm_bridge_log_trigger_send_id_sends_id_fk" FOREIGN KEY ("trigger_send_id") REFERENCES "marketing"."sends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."crm_bridge_log" ADD CONSTRAINT "crm_bridge_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."events" ADD CONSTRAINT "events_send_id_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "marketing"."sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."events" ADD CONSTRAINT "events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."list_members" ADD CONSTRAINT "list_members_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "marketing"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."list_members" ADD CONSTRAINT "list_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "marketing"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "crm"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crm"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."sends" ADD CONSTRAINT "sends_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."sends" ADD CONSTRAINT "sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."sequence_members" ADD CONSTRAINT "sequence_members_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "marketing"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."sequence_members" ADD CONSTRAINT "sequence_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "marketing"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."sequences" ADD CONSTRAINT "sequences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."templates" ADD CONSTRAINT "templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."user_projects" ADD CONSTRAINT "user_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crm"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing"."user_projects" ADD CONSTRAINT "user_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "marketing"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mkt_canned_scope_project_idx" ON "marketing"."canned_responses" USING btree ("scope","project_id");--> statement-breakpoint
CREATE INDEX "mkt_consent_identifier_idx" ON "marketing"."consent_log" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "mkt_consent_action_idx" ON "marketing"."consent_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "mkt_contacts_email_idx" ON "marketing"."contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "mkt_contacts_ibge_idx" ON "marketing"."contacts" USING btree ("ibge");--> statement-breakpoint
CREATE INDEX "mkt_contacts_status_idx" ON "marketing"."contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mkt_contacts_source_idx" ON "marketing"."contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "mkt_contacts_uf_idx" ON "marketing"."contacts" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "mkt_contacts_role_idx" ON "marketing"."contacts" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_phone_uniq" ON "marketing"."conversations" USING btree ("channel","wa_phone");--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "marketing"."conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "marketing"."conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_assigned_idx" ON "marketing"."conversations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "mkt_events_send_idx" ON "marketing"."events" USING btree ("send_id");--> statement-breakpoint
CREATE INDEX "mkt_events_contact_idx" ON "marketing"."events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "mkt_events_type_idx" ON "marketing"."events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "mkt_events_occurred_idx" ON "marketing"."events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mkt_list_members_unique" ON "marketing"."list_members" USING btree ("audience_id","contact_id");--> statement-breakpoint
CREATE INDEX "mkt_list_members_contact_idx" ON "marketing"."list_members" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "marketing"."messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subs_user_idx" ON "marketing"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mkt_queue_status_runat_idx" ON "marketing"."queue_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "mkt_queue_type_idx" ON "marketing"."queue_jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "mkt_sends_campaign_idx" ON "marketing"."sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "mkt_sends_contact_idx" ON "marketing"."sends" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "mkt_sends_status_idx" ON "marketing"."sends" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "mkt_suppressions_unique" ON "marketing"."suppressions" USING btree ("identifier","channel");--> statement-breakpoint
CREATE INDEX "mkt_suppressions_reason_idx" ON "marketing"."suppressions" USING btree ("reason");--> statement-breakpoint
CREATE UNIQUE INDEX "mkt_user_projects_unique" ON "marketing"."user_projects" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "mkt_user_projects_user_idx" ON "marketing"."user_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mkt_user_projects_project_idx" ON "marketing"."user_projects" USING btree ("project_id");