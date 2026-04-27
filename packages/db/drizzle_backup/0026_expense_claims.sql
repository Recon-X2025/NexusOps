-- HR expense_claims (shared enums with expense_reports — see packages/db/src/schema/expenses.ts)
DO $$ BEGIN
 CREATE TYPE "public"."expense_status" AS ENUM(
   'draft', 'submitted', 'under_review', 'approved', 'rejected', 'reimbursed', 'paid', 'cancelled'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."expense_category" AS ENUM(
   'travel', 'accommodation', 'food', 'meals', 'fuel', 'transport', 'communication',
   'office_supplies', 'software', 'marketing', 'client_entertainment', 'training',
   'entertainment', 'medical', 'miscellaneous', 'other'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "expense_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" "expense_category" DEFAULT 'miscellaneous' NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "expense_date" timestamp with time zone NOT NULL,
  "status" "expense_status" DEFAULT 'draft' NOT NULL,
  "receipt_url" text,
  "project_code" text,
  "approved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone,
  "rejection_reason" text,
  "reimbursed_at" timestamp with time zone,
  "payment_mode" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expense_claims_org_idx" ON "expense_claims" ("org_id");
CREATE INDEX IF NOT EXISTS "expense_claims_employee_idx" ON "expense_claims" ("employee_id");
CREATE INDEX IF NOT EXISTS "expense_claims_status_idx" ON "expense_claims" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_number_org_idx" ON "expense_claims" ("org_id", "number");
