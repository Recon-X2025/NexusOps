ALTER TABLE "work_order_tasks" ALTER COLUMN "estimated_hours" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "work_order_tasks" ALTER COLUMN "actual_hours" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "estimated_hours" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "actual_hours" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_step" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_completed_at" timestamp with time zone;