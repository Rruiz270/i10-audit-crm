CREATE SCHEMA "crm";
--> statement-breakpoint
CREATE SCHEMA "fundeb";
--> statement-breakpoint
CREATE TABLE "crm"."accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "crm"."activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"type" text NOT NULL,
	"subject" text,
	"body" text,
	"occurred_at" timestamp DEFAULT now(),
	"actor_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"is_primary" boolean DEFAULT false,
	"notes" text,
	"marketing_contact_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fundeb"."consultorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"municipality_id" integer,
	"status" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"notes" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"consultant_name" text,
	"secretary_name" text,
	"annotations" text
);
--> statement-breakpoint
CREATE TABLE "fundeb"."municipalities" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"codigo_ibge" varchar(7),
	"uf" varchar(2),
	"regiao" text,
	"report_url" text,
	"report_resumo_url" text,
	CONSTRAINT "municipalities_codigo_ibge_unique" UNIQUE("codigo_ibge")
);
--> statement-breakpoint
CREATE TABLE "crm"."lead_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"fields_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "lead_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crm"."lead_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer,
	"payload" jsonb NOT NULL,
	"source_ip" text,
	"user_agent" text,
	"opportunity_id" integer,
	"triaged" boolean DEFAULT false,
	"triaged_by" text,
	"triaged_at" timestamp,
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"title" text,
	"kind" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 30,
	"location" text,
	"meet_link" text,
	"google_event_id" text,
	"google_calendar_id" text,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"completed_at" timestamp,
	"outcome" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"municipality_id" integer,
	"owner_id" text,
	"active_no" integer,
	"stage" text DEFAULT 'novo' NOT NULL,
	"stage_updated_at" timestamp DEFAULT now(),
	"source" text,
	"estimated_value" real,
	"close_date" timestamp,
	"contract_signed" boolean DEFAULT false,
	"contract_notes" text,
	"won_at" timestamp,
	"lost_at" timestamp,
	"lost_reason" text,
	"handed_off_consultoria_id" integer,
	"handed_off_at" timestamp,
	"notes" text,
	"tags" text[] DEFAULT '{}',
	"products" text[] DEFAULT '{}',
	"lost_reason_code" text,
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."pipeline_stages" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'slate-500' NOT NULL,
	"order" integer NOT NULL,
	"probability" real DEFAULT 0.5 NOT NULL,
	"rot_days" integer,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"products" text[] DEFAULT '{}',
	"status" text DEFAULT 'rascunho' NOT NULL,
	"total" real,
	"items" jsonb DEFAULT '[]'::jsonb,
	"valid_days" integer DEFAULT 30,
	"external_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm"."tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"slug" text,
	"category" text DEFAULT 'outro' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crm"."tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"assigned_to" text,
	"created_by" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"notify_task_overdue" boolean DEFAULT true NOT NULL,
	"notify_new_lead" boolean DEFAULT true NOT NULL,
	"notify_handoff_kickoff" boolean DEFAULT true NOT NULL,
	"notify_bncc_signals" boolean DEFAULT true NOT NULL,
	"default_pipeline_filter" text DEFAULT 'all' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"working_hours_start" text,
	"working_hours_end" text,
	"display_compact" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"role" text DEFAULT 'consultor' NOT NULL,
	"google_refresh_token" text,
	"is_active" boolean DEFAULT true,
	"password_hash" text,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"display_name" text,
	"phone" text,
	"signature" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "crm"."verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "crm"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crm"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."activities" ADD CONSTRAINT "activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."contacts" ADD CONSTRAINT "contacts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."lead_submissions" ADD CONSTRAINT "lead_submissions_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "crm"."lead_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."lead_submissions" ADD CONSTRAINT "lead_submissions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."lead_submissions" ADD CONSTRAINT "lead_submissions_triaged_by_users_id_fk" FOREIGN KEY ("triaged_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."meetings" ADD CONSTRAINT "meetings_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."opportunities" ADD CONSTRAINT "opportunities_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "fundeb"."municipalities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."opportunities" ADD CONSTRAINT "opportunities_handed_off_consultoria_id_consultorias_id_fk" FOREIGN KEY ("handed_off_consultoria_id") REFERENCES "fundeb"."consultorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD CONSTRAINT "proposals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD CONSTRAINT "proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crm"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "crm"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "crm"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crm"."users"("id") ON DELETE cascade ON UPDATE no action;