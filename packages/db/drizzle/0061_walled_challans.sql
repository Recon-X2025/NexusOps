-- 0061_walled_challans — A11: extend the RLS wall to the three tenant tables that
-- were added AFTER 0052 and never walled.
--
-- Context. Migration 0052_odd_forgotten_wall installed Postgres Row-Level Security
-- (ENABLE + FORCE + a `tenant_isolation` policy) on every tenant table that existed
-- at the time, plus the non-privileged `app_runtime` role the request path drops to
-- via `SET LOCAL ROLE`. Three tenant tables landed later and were never added to that
-- set:
--   • shift_schedules       (0053)
--   • esi_challan_records    (0055)
--   • pt_challan_records     (india-compliance)
-- All three carry `org_id`, so they are tenant tables by the exact rule 0052 used —
-- but they have no database wall. The app-layer `eq(table.orgId, ctx.org.id)` filter
-- IS already present on every current query against them, so this closes the
-- defence-in-depth backstop (the second wall), not a live leak.
--
-- This migration is hand-authored: drizzle-kit does not model CREATE POLICY / RLS, so
-- the generated snapshot cannot represent it (see the SNAPSHOT NOTE in the matching
-- meta snapshot). The stanza per table is copied verbatim from 0052.
--
-- `app_runtime` already has DML on these tables: 0052 set ALTER DEFAULT PRIVILEGES so
-- every table created after it auto-grants SELECT/INSERT/UPDATE/DELETE to app_runtime.
-- No GRANT is needed here; only ENABLE + FORCE + the policy.

ALTER TABLE "shift_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shift_schedules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "shift_schedules";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "shift_schedules"
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
--> statement-breakpoint
ALTER TABLE "esi_challan_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "esi_challan_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "esi_challan_records";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "esi_challan_records"
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
--> statement-breakpoint
ALTER TABLE "pt_challan_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pt_challan_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "pt_challan_records";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pt_challan_records"
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
