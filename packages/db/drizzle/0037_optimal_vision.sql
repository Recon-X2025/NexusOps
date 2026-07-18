ALTER TABLE "organizations" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pan_masked_display" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pan_masked_display" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pan_masked_display" text;--> statement-breakpoint
ALTER TABLE "directors" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "directors" ADD COLUMN "pan_masked_display" text;--> statement-breakpoint
ALTER TABLE "company_directors" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "company_directors" ADD COLUMN "pan_masked_display" text;--> statement-breakpoint
ALTER TABLE "share_capital" ADD COLUMN "pan_masked_hash" text;--> statement-breakpoint
ALTER TABLE "share_capital" ADD COLUMN "pan_masked_display" text;