-- 0066_calm_bloodstrike — employee statutory ingestion pass (C2-STRUCT / C1 / C3 enabler).
--
-- Adds the statutory determinants that had no way onto the employee record, so payroll
-- stops deducting/filing on unchosen defaults:
--   • gender               — Maharashtra PT is gender-split; drives bracket selection.
--   • date_of_birth        — sole source for the over-65 PT exemption.
--   • pt_exempt_* (×3)      — CA Tier-1 PT exemptions (armed forces / own disability /
--                            dependent-with-disability); ANY true ⇒ PT bypassed all states.
--   • esi_ip_number, bank_account_name — statutory identity fields the schema lacked.
-- All adds are nullable or DEFAULT false, so the migration is safe on the already-
-- populated employees table (no backfill, no NOT NULL clamp). The exemption flags default
-- false = "not exempt" (the safe direction: PT charged unless a verified exemption is
-- declared). See reports/fix-plan.md → C2 and computePT's PT-exemption guard.

CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "esi_ip_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "gender" "gender";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "date_of_birth" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pt_exempt_armed_forces" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pt_exempt_disability" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pt_exempt_dependent_disability" boolean DEFAULT false NOT NULL;