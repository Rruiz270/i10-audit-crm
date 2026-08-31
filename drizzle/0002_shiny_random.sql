CREATE TABLE "crm"."proposal_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"kind" text NOT NULL,
	"session_key" text,
	"read_seconds" integer,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD COLUMN "accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD COLUMN "accepted_by_name" text;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD COLUMN "accepted_by_role" text;--> statement-breakpoint
ALTER TABLE "crm"."proposal_events" ADD CONSTRAINT "proposal_events_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "crm"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proposals" ADD CONSTRAINT "proposals_public_token_unique" UNIQUE("public_token");