ALTER TABLE "payslips" ADD COLUMN "paid_days" numeric(5, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "lop_days" numeric(5, 1) DEFAULT '0' NOT NULL;