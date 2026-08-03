ALTER TABLE "payslips" ADD COLUMN "ytd_net" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "ytd_pf" numeric(12, 2) DEFAULT '0' NOT NULL;