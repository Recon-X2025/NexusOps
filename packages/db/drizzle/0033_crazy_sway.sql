CREATE TABLE IF NOT EXISTS "vulnerability_sla_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vulnerability_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"level" integer,
	"notified_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN "sla_breached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN "escalation_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_sla_events" ADD CONSTRAINT "vulnerability_sla_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_sla_events" ADD CONSTRAINT "vulnerability_sla_events_vulnerability_id_vulnerabilities_id_fk" FOREIGN KEY ("vulnerability_id") REFERENCES "public"."vulnerabilities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_sla_events" ADD CONSTRAINT "vulnerability_sla_events_notified_user_id_users_id_fk" FOREIGN KEY ("notified_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vuln_sla_events_vuln_idx" ON "vulnerability_sla_events" USING btree ("org_id","vulnerability_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_sla_idx" ON "vulnerabilities" USING btree ("org_id","sla_breached");