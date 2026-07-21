CREATE INDEX "activities_opportunity_id_idx" ON "crm"."activities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "contacts_opportunity_id_idx" ON "crm"."contacts" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunities_owner_id_idx" ON "crm"."opportunities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_idx" ON "crm"."opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "opportunities_municipality_id_idx" ON "crm"."opportunities" USING btree ("municipality_id");--> statement-breakpoint
CREATE INDEX "tasks_opportunity_id_due_at_idx" ON "crm"."tasks" USING btree ("opportunity_id","due_at");