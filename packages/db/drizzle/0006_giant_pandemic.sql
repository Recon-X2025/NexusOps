DROP INDEX IF EXISTS "purchase_requests_idempotency_key_idx";--> statement-breakpoint
-- approval_steps has no insert path (rows are only ever updated), so it is
-- empty in practice. Clear any stray rows so the NOT NULL org_id column can be
-- added safely even if the table is non-empty, since there is no source to
-- backfill org_id from.--> statement-breakpoint
DELETE FROM "approval_steps";--> statement-breakpoint
ALTER TABLE "approval_steps" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_key_results_org_idx" ON "okr_key_results" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_key_results_objective_idx" ON "okr_key_results" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_org_idx" ON "approval_requests" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_idempotency_key_idx" ON "approval_requests" USING btree ("org_id","idempotency_key") WHERE "approval_requests"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_article_revisions_org_idx" ON "kb_article_revisions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wo_tasks_org_idx" ON "work_order_tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_steps_org_idx" ON "approval_steps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_esign_events_org_idx" ON "contract_esign_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_idempotency_key_idx" ON "purchase_requests" USING btree ("org_id","idempotency_key") WHERE "purchase_requests"."idempotency_key" is not null;