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
ALTER TABLE "dpdp_consent_records" ADD COLUMN "regime_code" text DEFAULT 'DPDP' NOT NULL;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "regime_code" text DEFAULT 'DPDP' NOT NULL;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "erasure_executed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dpdp_data_subject_requests" ADD COLUMN "erasure_summary" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_notification_artifacts" ADD CONSTRAINT "dpdp_notification_artifacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_notif_artifacts_related_idx" ON "dpdp_notification_artifacts" USING btree ("org_id","related_type","related_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_notif_artifacts_org_dispatched_idx" ON "dpdp_notification_artifacts" USING btree ("org_id","dispatched_at");