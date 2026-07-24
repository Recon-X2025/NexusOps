ALTER TABLE "payroll_runs" ADD COLUMN "total_esi_employee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "total_esi_employer" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "esi_employee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "esi_employer" numeric(12, 2) DEFAULT '0' NOT NULL;