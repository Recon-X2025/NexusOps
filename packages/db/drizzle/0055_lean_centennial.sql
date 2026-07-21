CREATE TYPE "public"."statutory_return_status" AS ENUM('generated', 'submitting', 'submitted', 'rejected', 'not_configured', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "esi_challan_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"return_file_url" text,
	"status" "statutory_return_status" DEFAULT 'generated' NOT NULL,
	"challan_number" text,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_employee_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_employer_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payload_json" jsonb,
	"ack_json" jsonb,
	"submitted_at" timestamp with time zone,
	"portal_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_challan_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"state_code" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"pt_registration_number" text,
	"challan_file_url" text,
	"status" "statutory_return_status" DEFAULT 'generated' NOT NULL,
	"challan_number" text,
	"total_employees" integer DEFAULT 0 NOT NULL,
	"total_pt_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payload_json" jsonb,
	"ack_json" jsonb,
	"submitted_at" timestamp with time zone,
	"portal_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esi_challan_records" ADD CONSTRAINT "esi_challan_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_challan_records" ADD CONSTRAINT "pt_challan_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "esi_challan_org_month_year_idx" ON "esi_challan_records" USING btree ("org_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "esi_challan_org_idx" ON "esi_challan_records" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pt_challan_org_state_month_year_idx" ON "pt_challan_records" USING btree ("org_id","state_code","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_challan_org_idx" ON "pt_challan_records" USING btree ("org_id");
