ALTER TABLE "employees" ADD COLUMN "aadhaar_masked_hash" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "aadhaar_masked_display" text;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "retain_until_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retain_until_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "retain_until_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directors" ADD COLUMN "aadhaar_masked_hash" text;--> statement-breakpoint
ALTER TABLE "directors" ADD COLUMN "aadhaar_masked_display" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "retain_until_date" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payslips_org_retain_idx" ON "payslips" USING btree ("org_id","retain_until_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_retain_idx" ON "invoices" USING btree ("org_id","retain_until_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_org_retain_idx" ON "purchase_orders" USING btree ("org_id","retain_until_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "je_org_retain_idx" ON "journal_entries" USING btree ("org_id","retain_until_date");--> statement-breakpoint
-- Backfill statutory retention floor (anchor + 8 years) for legacy rows.
-- Anchors mirror lib/retention.ts / the create-path stamping.
UPDATE "journal_entries" SET "retain_until_date" = "date" + interval '8 years' WHERE "retain_until_date" IS NULL AND "date" IS NOT NULL;--> statement-breakpoint
UPDATE "invoices" SET "retain_until_date" = "invoice_date" + interval '8 years' WHERE "retain_until_date" IS NULL AND "invoice_date" IS NOT NULL;--> statement-breakpoint
UPDATE "purchase_orders" SET "retain_until_date" = "created_at" + interval '8 years' WHERE "retain_until_date" IS NULL AND "created_at" IS NOT NULL;--> statement-breakpoint
UPDATE "payslips" SET "retain_until_date" = COALESCE("payroll_runs"."paid_at", "payslips"."created_at") + interval '8 years' FROM "payroll_runs" WHERE "payslips"."payroll_run_id" = "payroll_runs"."id" AND "payslips"."retain_until_date" IS NULL;