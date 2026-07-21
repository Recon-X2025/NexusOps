ALTER TABLE "mca_filing_records" ADD COLUMN "payload_json" jsonb;--> statement-breakpoint
ALTER TABLE "mca_filing_records" ADD COLUMN "ack_json" jsonb;--> statement-breakpoint
ALTER TABLE "mca_filing_records" ADD COLUMN "portal_error" text;--> statement-breakpoint
ALTER TABLE "mca_filing_records" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mca_filing_records_srn_idx" ON "mca_filing_records" USING btree ("srn");