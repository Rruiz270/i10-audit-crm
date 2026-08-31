CREATE TABLE "crm"."municipality_prospecting" (
	"municipality_id" integer PRIMARY KEY NOT NULL,
	"ano_referencia" integer,
	"matriculas" integer,
	"receita_fundeb" real,
	"complementacao_vaat" real,
	"complementacao_vaar" real,
	"fonte" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crm"."municipality_prospecting" ADD CONSTRAINT "municipality_prospecting_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "fundeb"."municipalities"("id") ON DELETE no action ON UPDATE no action;