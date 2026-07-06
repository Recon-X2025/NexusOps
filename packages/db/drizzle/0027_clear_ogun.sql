CREATE TYPE "public"."csat_channel" AS ENUM('in_app', 'email', 'both');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "csat_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"channel" "csat_channel" DEFAULT 'both' NOT NULL,
	"suppression_window_hours" integer DEFAULT 24 NOT NULL,
	"expiry_days" integer DEFAULT 14 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "csat_settings_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csat_settings" ADD CONSTRAINT "csat_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csat_settings_org_idx" ON "csat_settings" USING btree ("org_id");