ALTER TABLE "organizations" ADD COLUMN "pt_registration_number" text;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "pf_wage_base" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "pf_employer_eps" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "pf_employer_epf" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tds_challan_records_org_month_year_idx" ON "tds_challan_records" USING btree ("org_id","month","year");