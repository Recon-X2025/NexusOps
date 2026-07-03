CREATE TYPE "public"."dpdp_consent_status" AS ENUM('granted', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "dpdp_consent_status",
	"to_status" "dpdp_consent_status" NOT NULL,
	"version" integer,
	"reason" text,
	"channel" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"principal_ref" text NOT NULL,
	"principal_name" text,
	"purpose" text NOT NULL,
	"processing_activity_id" uuid,
	"lawful_basis" text DEFAULT 'consent' NOT NULL,
	"status" "dpdp_consent_status" DEFAULT 'granted' NOT NULL,
	"consent_artifact" text,
	"version" integer DEFAULT 1 NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_consent_events" ADD CONSTRAINT "dpdp_consent_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_consent_events" ADD CONSTRAINT "dpdp_consent_events_consent_id_dpdp_consent_records_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."dpdp_consent_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_consent_events" ADD CONSTRAINT "dpdp_consent_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_consent_records" ADD CONSTRAINT "dpdp_consent_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_consent_records" ADD CONSTRAINT "dpdp_consent_records_processing_activity_id_dpdp_processing_activities_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."dpdp_processing_activities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_consent_events_consent_idx" ON "dpdp_consent_events" USING btree ("consent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_consent_events_org_idx" ON "dpdp_consent_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dpdp_consent_org_principal_purpose_uidx" ON "dpdp_consent_records" USING btree ("org_id","principal_ref","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_consent_org_status_idx" ON "dpdp_consent_records" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_consent_org_principal_idx" ON "dpdp_consent_records" USING btree ("org_id","principal_ref");