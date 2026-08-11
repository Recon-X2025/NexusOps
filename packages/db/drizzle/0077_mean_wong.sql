ALTER TABLE "employees" ADD COLUMN "voluntary_pf_rate" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "da" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD COLUMN "da_percent" numeric(5, 2) DEFAULT '0' NOT NULL;