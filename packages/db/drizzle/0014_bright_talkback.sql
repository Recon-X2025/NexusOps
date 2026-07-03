ALTER TABLE "audit_logs" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "entry_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_logs_org_seq_idx" ON "audit_logs" USING btree ("org_id","seq");