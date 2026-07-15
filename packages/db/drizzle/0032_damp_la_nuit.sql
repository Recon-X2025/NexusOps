CREATE TABLE IF NOT EXISTS "mfa_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"totp_secret" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"backup_codes" text[] DEFAULT '{}' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "dpdp_notification_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"related_type" text NOT NULL,
	"related_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"audience" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'logged' NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN "sla_breached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN "escalation_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dpdp_consent_records" ADD COLUMN "regime_code" text DEFAULT 'DPDP' NOT NULL;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "regime_code" text DEFAULT 'DPDP' NOT NULL;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "erasure_executed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "erasure_summary" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
DO $$ BEGIN
 ALTER TABLE "dpdp_notification_artifacts" ADD CONSTRAINT "dpdp_notification_artifacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mfa_enrollments_user_id_idx" ON "mfa_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfa_enrollments_org_id_idx" ON "mfa_enrollments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vuln_sla_events_vuln_idx" ON "vulnerability_sla_events" USING btree ("org_id","vulnerability_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_notif_artifacts_related_idx" ON "dpdp_notification_artifacts" USING btree ("org_id","related_type","related_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_notif_artifacts_org_dispatched_idx" ON "dpdp_notification_artifacts" USING btree ("org_id","dispatched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_sla_idx" ON "vulnerabilities" USING btree ("org_id","sla_breached");