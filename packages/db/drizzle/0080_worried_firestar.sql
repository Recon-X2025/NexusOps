CREATE TYPE "public"."entity_type" AS ENUM('private_limited', 'public_limited', 'one_person_company', 'llp', 'partnership_firm', 'sole_proprietorship', 'huf', 'trust_society_section8');--> statement-breakpoint
CREATE TYPE "public"."declaration_provenance" AS ENUM('provisional', 'proven', 'lapsed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"section_80c" numeric(14, 2) DEFAULT '0' NOT NULL,
	"section_80d" numeric(14, 2) DEFAULT '0' NOT NULL,
	"section_80ccd1b" numeric(14, 2) DEFAULT '0' NOT NULL,
	"section_80tta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"section_24b" numeric(14, 2) DEFAULT '0' NOT NULL,
	"provenance" "declaration_provenance" DEFAULT 'provisional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "entity_type" "entity_type";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_declarations_employee_fy_idx" ON "tax_declarations" USING btree ("employee_id","fiscal_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_declarations_org_idx" ON "tax_declarations" USING btree ("org_id");--> statement-breakpoint
-- RLS wall for tax_declarations (a tenant table — carries org_id). Hand-added: drizzle-kit does not
-- model RLS, so this is not in the snapshot (same convention as 0052/0061). ENABLE + FORCE + the
-- tenant_isolation policy; app_runtime already auto-gets DML via 0052's ALTER DEFAULT PRIVILEGES.
ALTER TABLE "tax_declarations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_declarations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "tax_declarations";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tax_declarations"
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