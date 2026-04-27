-- Financial expense reports (`expenseReports` router) + line items; enums shared with HR `expense_claims` schema.

DO $$ BEGIN
  CREATE TYPE "public"."expense_status" AS ENUM(
    'draft', 'submitted', 'under_review', 'approved', 'rejected', 'reimbursed', 'paid', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."expense_category" AS ENUM(
    'travel', 'accommodation', 'food', 'meals', 'fuel', 'transport', 'communication',
    'office_supplies', 'software', 'marketing', 'client_entertainment', 'training',
    'entertainment', 'medical', 'miscellaneous', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "expense_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "submitted_by_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "approver_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "status" "expense_status" NOT NULL DEFAULT 'draft',
  "currency" text NOT NULL DEFAULT 'INR',
  "total_amount" numeric(14, 2) NOT NULL DEFAULT '0',
  "reimbursable_amount" numeric(14, 2) NOT NULL DEFAULT '0',
  "notes" text,
  "business_purpose" text,
  "rejection_reason" text,
  "paid_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "expense_reports_org_idx" ON "expense_reports" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "expense_reports_submitter_idx" ON "expense_reports" USING btree ("org_id", "submitted_by_id");
CREATE INDEX IF NOT EXISTS "expense_reports_status_idx" ON "expense_reports" USING btree ("org_id", "status");

CREATE TABLE IF NOT EXISTS "expense_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "report_id" uuid NOT NULL REFERENCES "public"."expense_reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "category" "expense_category" NOT NULL DEFAULT 'other',
  "description" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'INR',
  "receipt_url" text,
  "receipt_file_name" text,
  "expense_date" timestamp with time zone NOT NULL DEFAULT now(),
  "merchant" text,
  "is_billable" boolean NOT NULL DEFAULT false,
  "project_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "expense_items_report_idx" ON "expense_items" USING btree ("report_id");
CREATE INDEX IF NOT EXISTS "expense_items_org_idx" ON "expense_items" USING btree ("org_id");
