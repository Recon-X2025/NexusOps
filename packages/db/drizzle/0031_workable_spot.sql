CREATE TABLE IF NOT EXISTS "super_admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"org_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "support_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pan" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tan" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "epf_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "primary_state_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sla_p1_hours" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sla_p2_hours" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sla_p3_hours" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sla_p4_hours" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gstin_registry_gstin_idx" ON "gstin_registry" USING btree ("gstin");