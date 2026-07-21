ALTER TYPE "public"."ecr_submission_status" ADD VALUE 'submitting' BEFORE 'submitted';--> statement-breakpoint
ALTER TYPE "public"."ecr_submission_status" ADD VALUE 'not_configured';--> statement-breakpoint
ALTER TYPE "public"."ecr_submission_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "epfo_ecr_submissions" ADD COLUMN "portal_error" text;--> statement-breakpoint
ALTER TABLE "epfo_ecr_submissions" ADD COLUMN "last_attempt_at" timestamp with time zone;