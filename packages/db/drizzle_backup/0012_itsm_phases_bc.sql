-- Phase B/C ITSM extensions: CMDB link, known error, major incident, intake channel, OLA handoffs, change blackouts.

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "configuration_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "known_error_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "is_major_incident" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "intake_channel" text DEFAULT 'portal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_configuration_item_id_ci_items_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_configuration_item_id_ci_items_id_fk" FOREIGN KEY ("configuration_item_id") REFERENCES "public"."ci_items"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_known_error_id_known_errors_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_known_error_id_known_errors_id_fk" FOREIGN KEY ("known_error_id") REFERENCES "public"."known_errors"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_assignee_id" uuid,
	"to_assignee_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"met_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" DROP CONSTRAINT IF EXISTS "ticket_handoffs_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" DROP CONSTRAINT IF EXISTS "ticket_handoffs_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" DROP CONSTRAINT IF EXISTS "ticket_handoffs_from_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_from_assignee_id_users_id_fk" FOREIGN KEY ("from_assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" DROP CONSTRAINT IF EXISTS "ticket_handoffs_to_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_to_assignee_id_users_id_fk" FOREIGN KEY ("to_assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_handoffs_org_ticket_idx" ON "ticket_handoffs" USING btree ("org_id","ticket_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_blackout_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_blackout_windows" DROP CONSTRAINT IF EXISTS "change_blackout_windows_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "change_blackout_windows" ADD CONSTRAINT "change_blackout_windows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_blackout_windows_org_idx" ON "change_blackout_windows" USING btree ("org_id");
