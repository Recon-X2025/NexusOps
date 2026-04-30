CREATE TYPE "public"."event_severity" AS ENUM('critical', 'major', 'minor', 'warning', 'info', 'clear');--> statement-breakpoint
CREATE TYPE "public"."event_state" AS ENUM('open', 'in_progress', 'resolved', 'suppressed', 'flapping');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itom_correlation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"condition" text NOT NULL,
	"action" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itom_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"node" text NOT NULL,
	"metric" text NOT NULL,
	"value" text,
	"threshold" text,
	"severity" "event_severity" DEFAULT 'info' NOT NULL,
	"state" "event_state" DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'monitoring' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"ai_root_cause" text,
	"linked_incident_id" uuid,
	"first_occurrence" timestamp with time zone DEFAULT now() NOT NULL,
	"last_occurrence" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itom_suppression_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"condition" text NOT NULL,
	"suppress_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_correlation_policies" ADD CONSTRAINT "itom_correlation_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_events" ADD CONSTRAINT "itom_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_events" ADD CONSTRAINT "itom_events_linked_incident_id_tickets_id_fk" FOREIGN KEY ("linked_incident_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_suppression_rules" ADD CONSTRAINT "itom_suppression_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_suppression_rules" ADD CONSTRAINT "itom_suppression_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_correlation_policies_org_idx" ON "itom_correlation_policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_events_org_idx" ON "itom_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_events_node_idx" ON "itom_events" USING btree ("node");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_events_severity_idx" ON "itom_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_events_state_idx" ON "itom_events" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itom_suppression_rules_org_idx" ON "itom_suppression_rules" USING btree ("org_id");