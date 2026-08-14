CREATE TYPE "public"."leave_exit_treatment" AS ENUM('encash_all', 'capped', 'accrued_only');--> statement-breakpoint
CREATE TYPE "public"."leave_year_end_treatment" AS ENUM('forfeit', 'encash');--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "year_end_treatment" "leave_year_end_treatment" DEFAULT 'forfeit' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "exit_treatment" "leave_exit_treatment" DEFAULT 'encash_all' NOT NULL;