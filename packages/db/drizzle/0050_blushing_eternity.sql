CREATE TYPE "public"."eway_bill_status" AS ENUM('pending', 'generating', 'generated', 'cancelled', 'not_configured', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eway_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_number" text,
	"status" "eway_bill_status" DEFAULT 'pending' NOT NULL,
	"ewb_no" text,
	"valid_upto" timestamp with time zone,
	"consignment_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payload_json" jsonb,
	"ack_json" jsonb,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"portal_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eway_bills" ADD CONSTRAINT "eway_bills_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eway_bills_org_idx" ON "eway_bills" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eway_bills_invoice_idx" ON "eway_bills" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eway_bills_ewb_no_idx" ON "eway_bills" USING btree ("ewb_no");