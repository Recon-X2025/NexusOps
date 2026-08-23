CREATE TABLE IF NOT EXISTS "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"metric_id" text NOT NULL,
	"captured_on" date NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_org_metric_day_idx" ON "metric_snapshots" USING btree ("org_id","metric_id","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_snapshots_org_metric_idx" ON "metric_snapshots" USING btree ("org_id","metric_id");--> statement-breakpoint
-- ── Row-level security ──────────────────────────────────────────────────────
--
-- HAND-APPENDED. drizzle-kit does not model CREATE POLICY / ROW LEVEL SECURITY,
-- so the generated snapshot cannot represent this and never will. The stanza is
-- copied verbatim from 0061_walled_challans.sql, which took it from 0052.
--
-- CLAUDE.md: "A new tenant table carries `org_id` AND its RLS policy in the same
-- migration. Tables with no `org_id` are the class every isolation leak lives
-- in." `metric_snapshots` carries org_id, so it gets the wall in the same file
-- rather than a later one.
--
-- No GRANT is needed: 0052 set ALTER DEFAULT PRIVILEGES on the public schema, so
-- app_runtime picks up DML on tables created afterwards.
--
-- The policy fails OPEN when `app.org_id` is unset — that is the established
-- shape here, and it is why the app-layer filter is still written on every
-- query. RLS is the second wall, not the only one.
ALTER TABLE "metric_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "metric_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "metric_snapshots";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "metric_snapshots"
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
