CREATE TABLE IF NOT EXISTS "payroll_arrears" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"source_structure_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "arrears" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_arrears" ADD CONSTRAINT "payroll_arrears_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_arrears" ADD CONSTRAINT "payroll_arrears_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_arrears" ADD CONSTRAINT "payroll_arrears_source_structure_id_salary_structures_id_fk" FOREIGN KEY ("source_structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_arrears" ADD CONSTRAINT "payroll_arrears_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_arrears_employee_period_idx" ON "payroll_arrears" USING btree ("employee_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_arrears_org_idx" ON "payroll_arrears" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_arrears_org_period_idx" ON "payroll_arrears" USING btree ("org_id","year","month");--> statement-breakpoint
-- RLS wall for payroll_arrears (a tenant table — carries org_id). Hand-added: drizzle-kit does not
-- model RLS, so this is not in the snapshot (same convention as 0052/0061/0080). ENABLE + FORCE +
-- the tenant_isolation policy; app_runtime already auto-gets DML via 0052's ALTER DEFAULT PRIVILEGES.
-- This table holds money owed to a named employee, so it must not be reachable across tenants.
ALTER TABLE "payroll_arrears" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_arrears" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "payroll_arrears";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payroll_arrears"
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
