CREATE TYPE "public"."leave_encashment_basis" AS ENUM('basic_da', 'gross');--> statement-breakpoint
CREATE TYPE "public"."leave_exit_rule_treatment" AS ENUM('encash_full', 'proportion', 'capped', 'accrued_only', 'forfeit');--> statement-breakpoint
CREATE TYPE "public"."leave_expiry_mode" AS ENUM('year_end', 'window_weeks');--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'casual';--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'maternity';--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'paternity';--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'marriage';--> statement-breakpoint
ALTER TYPE "public"."leave_type" ADD VALUE 'compensatory_off';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_exit_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"reason" text NOT NULL,
	"treatment" "leave_exit_rule_treatment" DEFAULT 'encash_full' NOT NULL,
	"param" numeric(8, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_state_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"state_code" text NOT NULL,
	"state_name" text NOT NULL,
	"follows_baseline" boolean DEFAULT true NOT NULL,
	"earned_leave_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"casual_leave_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"sick_leave_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"casual_sick_combined" boolean DEFAULT false NOT NULL,
	"sick_half_pay" boolean DEFAULT false NOT NULL,
	"carry_forward_floor_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"provenance" text,
	"notes" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "encashment_basis" "leave_encashment_basis" DEFAULT 'basic_da' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "encashment_divisor" integer DEFAULT 26 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "debits_balance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "expiry_mode" "leave_expiry_mode" DEFAULT 'year_end' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN "expiry_window_weeks" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_exit_rules" ADD CONSTRAINT "leave_exit_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_state_baselines" ADD CONSTRAINT "leave_state_baselines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_exit_rules_scope_idx" ON "leave_exit_rules" USING btree ("org_id","type","reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_exit_rules_org_idx" ON "leave_exit_rules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_state_baselines_scope_idx" ON "leave_state_baselines" USING btree ("state_code","org_id","effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_state_baselines_state_idx" ON "leave_state_baselines" USING btree ("state_name");--> statement-breakpoint
-- RLS wall (rls-all-tables convention, cf. 0052/0061/0075/0080). leave_exit_rules is
-- tenant-scoped; leave_state_baselines is a nullable-org PLATFORM table (national baseline rows
-- have org_id NULL and stay visible to every tenant, like professional_tax_slabs). Enforced only
-- because the request path drops to app_runtime via SET LOCAL ROLE (0052).
ALTER TABLE "leave_exit_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_exit_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "leave_exit_rules";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "leave_exit_rules"
  USING (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  );--> statement-breakpoint
ALTER TABLE "leave_state_baselines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_state_baselines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "leave_state_baselines";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "leave_state_baselines"
  USING (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
    OR org_id IS NULL
  )
  WITH CHECK (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
    OR org_id IS NULL
  );
--> statement-breakpoint
-- LEAVE-MODEL state baseline seed (PT-STATES precedent): all 36 states/UTs as platform rows
-- (org_id NULL), each following the national baseline (earned 18 / casual 12 / sick 12, CF floor
-- 30) as a FACT pending per-state verification against its own act. NOT populated from a
-- secondary aggregator — every row ships as follows_baseline = true.
INSERT INTO "leave_state_baselines"
  ("state_code","state_name","follows_baseline","earned_leave_days","casual_leave_days","sick_leave_days","carry_forward_floor_days","provenance","notes")
SELECT v.code, v.name, true, 18, 12, 12, 30, 'national_baseline_pending_verification',
  'Follows the national baseline; verify against this state''s own Shops & Establishments / Factories Act.'
FROM (VALUES
  ('AP', 'Andhra Pradesh'),
  ('AR', 'Arunachal Pradesh'),
  ('AS', 'Assam'),
  ('BR', 'Bihar'),
  ('CT', 'Chhattisgarh'),
  ('GA', 'Goa'),
  ('GJ', 'Gujarat'),
  ('HR', 'Haryana'),
  ('HP', 'Himachal Pradesh'),
  ('JH', 'Jharkhand'),
  ('KA', 'Karnataka'),
  ('KL', 'Kerala'),
  ('MP', 'Madhya Pradesh'),
  ('MH', 'Maharashtra'),
  ('MN', 'Manipur'),
  ('ML', 'Meghalaya'),
  ('MZ', 'Mizoram'),
  ('NL', 'Nagaland'),
  ('OR', 'Odisha'),
  ('PB', 'Punjab'),
  ('RJ', 'Rajasthan'),
  ('SK', 'Sikkim'),
  ('TN', 'Tamil Nadu'),
  ('TG', 'Telangana'),
  ('TR', 'Tripura'),
  ('UP', 'Uttar Pradesh'),
  ('UT', 'Uttarakhand'),
  ('WB', 'West Bengal'),
  ('AN', 'Andaman and Nicobar Islands'),
  ('CH', 'Chandigarh'),
  ('DH', 'Dadra and Nagar Haveli and Daman and Diu'),
  ('DL', 'Delhi'),
  ('JK', 'Jammu and Kashmir'),
  ('LA', 'Ladakh'),
  ('LD', 'Lakshadweep'),
  ('PY', 'Puducherry')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM "leave_state_baselines" b WHERE b.state_code = v.code AND b.org_id IS NULL);
