CREATE TABLE IF NOT EXISTS "mac_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_email" text NOT NULL,
	"action" text NOT NULL,
	"target_org_id" uuid,
	"target_org_name" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"seq" integer,
	"prev_hash" text,
	"entry_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mac_audit_logs_action_idx" ON "mac_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mac_audit_logs_created_at_idx" ON "mac_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mac_audit_logs_seq_idx" ON "mac_audit_logs" USING btree ("seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mac_audit_logs_target_org_idx" ON "mac_audit_logs" USING btree ("target_org_id");