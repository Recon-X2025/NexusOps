-- 0099_breezy_william_stryker — CRM deal stage history (Phase 2, item 6).
--
-- `crm_deals.stage` records the CURRENT stage only. No prior stage, no time of
-- the move, no actor, and nothing anywhere else records them either — so
-- time-in-stage, stage ageing and conversion-between-stages are uncomputable
-- today rather than merely unreported. This table starts that record.
--
-- IT STARTS EMPTY AND IS NOT BACKFILLED. There is nothing to backfill from: the
-- prior stage of an existing deal is not recoverable from any column. A
-- fabricated first transition would be indistinguishable from a real one in
-- every metric later computed off this table, so none is written. History
-- accumulates FORWARD from this migration.
--
-- The RLS stanza below is HAND-WRITTEN: drizzle-kit does not model
-- CREATE POLICY / ROW LEVEL SECURITY, so the generated snapshot cannot
-- represent it (same note as 0052/0061). The stanza is copied verbatim from
-- 0061_walled_challans, which copied it from 0052.
--
-- No GRANT is needed: 0052 set ALTER DEFAULT PRIVILEGES so every table created
-- after it auto-grants SELECT/INSERT/UPDATE/DELETE to `app_runtime`. RLS only
-- bites because the request path drops to that non-privileged role via
-- SET LOCAL ROLE (see apps/api/src/lib/trpc.ts, `rlsTenant`); the app's own DB
-- user is a superuser and would bypass it.

CREATE TABLE IF NOT EXISTS "crm_deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage" "deal_stage" NOT NULL,
	"to_stage" "deal_stage" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deal_stage_history_org_idx" ON "crm_deal_stage_history" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deal_stage_history_deal_changed_idx" ON "crm_deal_stage_history" USING btree ("deal_id","changed_at");
--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "crm_deal_stage_history";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_deal_stage_history"
  USING (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  );
