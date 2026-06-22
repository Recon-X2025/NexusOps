-- Layer 8 / router alignment: columns and tables present in Drizzle app schema but missing from earlier migrations.

-- ── Invoices (financial.listInvoices) ─────────────────────────────────────
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_method" text;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_id_users_id_fk"
    FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Performance (review_cycles, performance_reviews, goals) ─────────────────
DO $$ BEGIN
  CREATE TYPE "public"."review_status" AS ENUM('draft', 'self_review', 'peer_review', 'manager_review', 'calibration', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."goal_status" AS ENUM('draft', 'active', 'at_risk', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."rating_scale" AS ENUM('1', '2', '3', '4', '5');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "review_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'annual',
  "status" text NOT NULL DEFAULT 'draft',
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone,
  "self_review_deadline" timestamp with time zone,
  "peer_review_deadline" timestamp with time zone,
  "manager_review_deadline" timestamp with time zone,
  "enable_360" text DEFAULT 'false',
  "notes" text,
  "created_by_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "review_cycles_org_idx" ON "review_cycles" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "review_cycles_status_idx" ON "review_cycles" USING btree ("org_id", "status");

CREATE TABLE IF NOT EXISTS "performance_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "cycle_id" uuid NOT NULL REFERENCES "public"."review_cycles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "reviewee_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "reviewer_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "reviewer_role" text NOT NULL DEFAULT 'manager',
  "status" "review_status" NOT NULL DEFAULT 'draft',
  "overall_rating" "rating_scale",
  "self_rating" "rating_scale",
  "strengths_text" text,
  "areas_for_growth_text" text,
  "manager_comments" text,
  "goals_achieved" integer DEFAULT 0,
  "goals_total" integer DEFAULT 0,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "performance_reviews_org_idx" ON "performance_reviews" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "performance_reviews_cycle_idx" ON "performance_reviews" USING btree ("cycle_id");
CREATE INDEX IF NOT EXISTS "performance_reviews_reviewee_idx" ON "performance_reviews" USING btree ("org_id", "reviewee_id");

CREATE TABLE IF NOT EXISTS "goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "cycle_id" uuid REFERENCES "public"."review_cycles"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "parent_goal_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "goal_type" text NOT NULL DEFAULT 'individual',
  "status" "goal_status" NOT NULL DEFAULT 'draft',
  "progress" integer NOT NULL DEFAULT 0,
  "target_value" numeric(14, 2),
  "current_value" numeric(14, 2),
  "unit" text,
  "due_date" timestamp with time zone,
  "tags" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "goals_org_idx" ON "goals" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "goals_owner_idx" ON "goals" USING btree ("org_id", "owner_id");
CREATE INDEX IF NOT EXISTS "goals_cycle_idx" ON "goals" USING btree ("cycle_id");
CREATE INDEX IF NOT EXISTS "goals_status_idx" ON "goals" USING btree ("org_id", "status");

-- ── Custom fields ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."custom_field_type" AS ENUM(
    'text', 'textarea', 'number', 'decimal', 'boolean', 'date', 'datetime',
    'select', 'multi_select', 'url', 'email', 'phone', 'user_reference', 'file', 'json'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."custom_field_entity" AS ENUM(
    'ticket', 'asset', 'employee', 'contract', 'vendor', 'project',
    'change_request', 'lead', 'invoice', 'expense_claim', 'okr_objective'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "entity" "custom_field_entity" NOT NULL,
  "name" text NOT NULL,
  "label" text NOT NULL,
  "type" "custom_field_type" NOT NULL DEFAULT 'text',
  "options" jsonb,
  "is_required" boolean NOT NULL DEFAULT false,
  "is_list_column" boolean NOT NULL DEFAULT false,
  "is_form_field" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "default_value" text,
  "group_name" text,
  "placeholder" text,
  "help_text" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cfd_org_entity_idx" ON "custom_field_definitions" USING btree ("org_id", "entity");
CREATE UNIQUE INDEX IF NOT EXISTS "cfd_org_entity_name_idx" ON "custom_field_definitions" USING btree ("org_id", "entity", "name");

CREATE TABLE IF NOT EXISTS "custom_field_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "field_id" uuid NOT NULL REFERENCES "public"."custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "entity" "custom_field_entity" NOT NULL,
  "entity_id" uuid NOT NULL,
  "value" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cfv_org_entity_record_idx" ON "custom_field_values" USING btree ("org_id", "entity", "entity_id");
CREATE INDEX IF NOT EXISTS "cfv_field_entity_idx" ON "custom_field_values" USING btree ("field_id", "entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cfv_unique_field_entity_idx" ON "custom_field_values" USING btree ("field_id", "entity_id");

-- ── CSM cases (raw SQL router) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "csm_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "priority" text NOT NULL DEFAULT 'medium',
  "account_id" uuid,
  "contact_id" uuid,
  "requester_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "status" text NOT NULL DEFAULT 'open',
  "assignee_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "resolution" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "csm_cases_org_number_idx" ON "csm_cases" USING btree ("org_id", "number");
CREATE INDEX IF NOT EXISTS "csm_cases_org_idx" ON "csm_cases" USING btree ("org_id");
