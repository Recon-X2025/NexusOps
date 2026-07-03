CREATE TYPE "public"."dpdp_breach_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."dpdp_breach_status" AS ENUM('detected', 'assessing', 'notifying', 'notified', 'contained', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_breach_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"breach_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "dpdp_breach_status",
	"to_status" "dpdp_breach_status",
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_breach_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "dpdp_breach_severity" DEFAULT 'medium' NOT NULL,
	"status" "dpdp_breach_status" DEFAULT 'detected' NOT NULL,
	"jurisdiction_code" text DEFAULT 'IN' NOT NULL,
	"affected_data_principals" integer,
	"data_categories" text,
	"linked_security_incident_id" uuid,
	"occurred_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notification_window_hours" integer DEFAULT 72 NOT NULL,
	"notify_due_at" timestamp with time zone NOT NULL,
	"board_notified_at" timestamp with time zone,
	"principals_notified_at" timestamp with time zone,
	"contained_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_events" ADD CONSTRAINT "dpdp_breach_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_events" ADD CONSTRAINT "dpdp_breach_events_breach_id_dpdp_breach_incidents_id_fk" FOREIGN KEY ("breach_id") REFERENCES "public"."dpdp_breach_incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_events" ADD CONSTRAINT "dpdp_breach_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_incidents" ADD CONSTRAINT "dpdp_breach_incidents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_incidents" ADD CONSTRAINT "dpdp_breach_incidents_linked_security_incident_id_security_incidents_id_fk" FOREIGN KEY ("linked_security_incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_breach_incidents" ADD CONSTRAINT "dpdp_breach_incidents_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_breach_events_breach_idx" ON "dpdp_breach_events" USING btree ("breach_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_breach_events_org_idx" ON "dpdp_breach_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dpdp_breach_org_reference_uidx" ON "dpdp_breach_incidents" USING btree ("org_id","reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_breach_org_status_idx" ON "dpdp_breach_incidents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_breach_org_notify_due_idx" ON "dpdp_breach_incidents" USING btree ("org_id","notify_due_at");