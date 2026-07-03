CREATE TYPE "public"."dsr_request_type" AS ENUM('access', 'correction', 'erasure', 'grievance', 'nomination');--> statement-breakpoint
CREATE TYPE "public"."dsr_status" AS ENUM('received', 'verifying', 'in_progress', 'on_hold', 'fulfilled', 'rejected', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"request_type" "dsr_request_type" NOT NULL,
	"status" "dsr_status" DEFAULT 'received' NOT NULL,
	"principal_name" text NOT NULL,
	"principal_email" text,
	"principal_phone" text,
	"requested_by_user_id" uuid,
	"assigned_to_user_id" uuid,
	"details" text,
	"linked_privacy_matter_id" uuid,
	"response_window_days" integer DEFAULT 30 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"resolution_note" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_dsr_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "dsr_status",
	"to_status" "dsr_status",
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_data_subject_requests" ADD CONSTRAINT "dpdp_data_subject_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_data_subject_requests" ADD CONSTRAINT "dpdp_data_subject_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_data_subject_requests" ADD CONSTRAINT "dpdp_data_subject_requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_data_subject_requests" ADD CONSTRAINT "dpdp_data_subject_requests_linked_privacy_matter_id_legal_matters_id_fk" FOREIGN KEY ("linked_privacy_matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_dsr_events" ADD CONSTRAINT "dpdp_dsr_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_dsr_events" ADD CONSTRAINT "dpdp_dsr_events_request_id_dpdp_data_subject_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."dpdp_data_subject_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_dsr_events" ADD CONSTRAINT "dpdp_dsr_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dpdp_dsr_org_reference_uidx" ON "dpdp_data_subject_requests" USING btree ("org_id","reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_dsr_org_status_idx" ON "dpdp_data_subject_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_dsr_org_due_idx" ON "dpdp_data_subject_requests" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_dsr_events_request_idx" ON "dpdp_dsr_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_dsr_events_org_idx" ON "dpdp_dsr_events" USING btree ("org_id");