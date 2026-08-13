CREATE TABLE IF NOT EXISTS "final_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"last_salary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"leave_encashment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gratuity" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notice_shortfall" numeric(14, 2) DEFAULT '0' NOT NULL,
	"advance_recovery" numeric(14, 2) DEFAULT '0' NOT NULL,
	"asset_recovery" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_recoveries" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gross_settlement" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_settlement" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unrecovered_shortfall" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_gratuity" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_encashment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tds" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "final_settlements" ADD CONSTRAINT "final_settlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "final_settlements" ADD CONSTRAINT "final_settlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "final_settlements" ADD CONSTRAINT "final_settlements_settled_by_id_users_id_fk" FOREIGN KEY ("settled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "final_settlements_emp_idx" ON "final_settlements" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "final_settlements_org_idx" ON "final_settlements" USING btree ("org_id");--> statement-breakpoint
-- final_settlements is a tenant table: extend the RLS wall to it (same convention as
-- 0052/0061/0080 — hand-written, not in the drizzle snapshot). ENABLE + FORCE + the
-- tenant_isolation policy; app_runtime already has DML via 0052's ALTER DEFAULT PRIVILEGES.
ALTER TABLE "final_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "final_settlements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "final_settlements";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "final_settlements"
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
