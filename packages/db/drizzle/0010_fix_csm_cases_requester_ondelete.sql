-- Corrective migration: csm_cases.requester_id was left as ON DELETE NO ACTION.
-- Migration 0003 attempted to change it to SET NULL but wrapped the ADD CONSTRAINT
-- in a DO/EXCEPTION block WITHOUT a preceding DROP, so the original NO ACTION
-- constraint (from 0002) survived. The drizzle snapshot already records SET NULL,
-- so a generated diff cannot self-heal this. This migration drops and re-adds the
-- constraint with the correct ON DELETE SET NULL rule.
ALTER TABLE "csm_cases" DROP CONSTRAINT IF EXISTS "csm_cases_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
