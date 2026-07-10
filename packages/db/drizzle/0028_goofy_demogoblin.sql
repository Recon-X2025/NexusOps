CREATE TYPE "public"."discovery_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hr_case_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TYPE "public"."facility_space_status" AS ENUM('acquired', 'occupied', 'let go');--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'primary' BEFORE 'vacation';--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'annual' BEFORE 'vacation';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"target" text NOT NULL,
	"status" "discovery_run_status" DEFAULT 'running' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text,
	"primary_email" text,
	"secondary_email" text,
	"phone" text,
	"secondary_phone" text,
	"education_docs" text,
	"employee_docs" text,
	"signed_offer_letter" text,
	"photo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facility_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"space_id" text NOT NULL,
	"name" text NOT NULL,
	"building" text,
	"floor" text,
	"type" text,
	"area" text,
	"capacity" integer,
	"assigned_to" text,
	"occupancy" text,
	"status" "facility_space_status" DEFAULT 'acquired' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oncall_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_requests" DROP CONSTRAINT "facility_requests_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "room_bookings" DROP CONSTRAINT "room_bookings_room_id_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "hr_cases" ADD COLUMN "status" "hr_case_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "linked_incident_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "release_id" uuid;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "release_id" uuid;--> statement-breakpoint
ALTER TABLE "facility_requests" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "itom_correlation_policies" ADD COLUMN "linked_incident_id" uuid;--> statement-breakpoint
ALTER TABLE "itom_suppression_rules" ADD COLUMN "linked_incident_id" uuid;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD COLUMN "review_form_url" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_details" ADD CONSTRAINT "onboarding_details_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_details" ADD CONSTRAINT "onboarding_details_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_spaces" ADD CONSTRAINT "facility_spaces_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_incidents" ADD CONSTRAINT "oncall_incidents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_incidents" ADD CONSTRAINT "oncall_incidents_schedule_id_oncall_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."oncall_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_runs_org_idx" ON "discovery_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_runs_status_idx" ON "discovery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_details_org_idx" ON "onboarding_details" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_details_emp_idx" ON "onboarding_details" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_spaces_org_idx" ON "facility_spaces" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oncall_incidents_schedule_idx" ON "oncall_incidents" USING btree ("schedule_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_linked_incident_id_tickets_id_fk" FOREIGN KEY ("linked_incident_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_requests" ADD CONSTRAINT "facility_requests_space_id_facility_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."facility_spaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_id_facility_spaces_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."facility_spaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_correlation_policies" ADD CONSTRAINT "itom_correlation_policies_linked_incident_id_tickets_id_fk" FOREIGN KEY ("linked_incident_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_suppression_rules" ADD CONSTRAINT "itom_suppression_rules_linked_incident_id_tickets_id_fk" FOREIGN KEY ("linked_incident_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "facility_requests" DROP COLUMN IF EXISTS "priority";--> statement-breakpoint
ALTER TABLE "facility_requests" DROP COLUMN IF EXISTS "assignee_id";--> statement-breakpoint
ALTER TABLE "public"."facility_requests" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."facility_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."facility_request_status";--> statement-breakpoint
CREATE TYPE "public"."facility_request_status" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
ALTER TABLE "public"."facility_requests" ALTER COLUMN "status" SET DATA TYPE "public"."facility_request_status" USING "status"::"public"."facility_request_status";--> statement-breakpoint
ALTER TABLE "facility_requests" ALTER COLUMN "status" SET DEFAULT 'open';