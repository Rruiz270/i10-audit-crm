CREATE TABLE "marketing"."ops_alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_notified_at" timestamp DEFAULT now() NOT NULL,
	"last_message" text
);
--> statement-breakpoint
CREATE TABLE "marketing"."ops_heartbeats" (
	"key" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp DEFAULT now() NOT NULL,
	"last_meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
-- read_count/replied_count já existem em ambientes onde scripts/migrate-wa-funnel.mjs
-- rodou (colunas criadas fora do fluxo drizzle) — IF NOT EXISTS torna idempotente.
ALTER TABLE "marketing"."campaigns" ADD COLUMN IF NOT EXISTS "read_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing"."campaigns" ADD COLUMN IF NOT EXISTS "replied_count" integer DEFAULT 0 NOT NULL;