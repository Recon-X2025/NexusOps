-- Chart of accounts, journal entries, GST registry (matches packages/db/src/schema/accounting.ts).
-- Idempotent: safe on databases that already ran drizzle-kit push.

DO $$ BEGIN
  CREATE TYPE "public"."account_type" AS ENUM(
    'asset', 'liability', 'equity', 'income', 'expense',
    'contra_asset', 'contra_liability', 'contra_equity', 'contra_income', 'contra_expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."account_sub_type" AS ENUM(
    'bank', 'cash', 'accounts_receivable', 'other_current_asset', 'fixed_asset',
    'accumulated_depreciation', 'other_asset', 'accounts_payable', 'credit_card',
    'other_current_liability', 'long_term_liability', 'owners_equity', 'retained_earnings',
    'share_capital', 'income', 'other_income', 'cost_of_goods_sold', 'expense', 'other_expense',
    'payroll_expense', 'depreciation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."journal_entry_type" AS ENUM(
    'manual', 'invoice', 'payment', 'payroll', 'depreciation', 'closing', 'opening',
    'reversal', 'gst_liability', 'tds_deduction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."gstr_filing_status" AS ENUM('draft', 'ready', 'filed', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" "account_type" NOT NULL,
  "sub_type" "account_sub_type",
  "parent_id" uuid,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
  "current_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
  "gstin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gstin_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "gstin" text NOT NULL,
  "legal_name" text NOT NULL,
  "trade_name" text,
  "state_code" text NOT NULL,
  "state_name" text,
  "address" text,
  "registration_date" timestamp with time zone,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "invoice_series_prefix" text,
  "current_invoice_seq" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gstr_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "gstin_id" uuid,
  "form_type" text NOT NULL,
  "month" integer NOT NULL,
  "year" integer NOT NULL,
  "financial_year" text NOT NULL,
  "status" "gstr_filing_status" DEFAULT 'draft' NOT NULL,
  "total_output_tax" numeric(15, 2) DEFAULT '0' NOT NULL,
  "total_itc" numeric(15, 2) DEFAULT '0' NOT NULL,
  "net_payable" numeric(15, 2) DEFAULT '0' NOT NULL,
  "json_payload" text,
  "filed_at" timestamp with time zone,
  "arn" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "number" text NOT NULL,
  "date" timestamp with time zone NOT NULL,
  "type" "journal_entry_type" DEFAULT 'manual' NOT NULL,
  "status" "journal_entry_status" DEFAULT 'draft' NOT NULL,
  "description" text,
  "reference" text,
  "currency" text DEFAULT 'INR' NOT NULL,
  "exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
  "total_debit" numeric(15, 2) DEFAULT '0' NOT NULL,
  "total_credit" numeric(15, 2) DEFAULT '0' NOT NULL,
  "reversal_of_id" uuid,
  "created_by_id" uuid,
  "posted_by_id" uuid,
  "posted_at" timestamp with time zone,
  "financial_year" text,
  "period" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_entry_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "debit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "credit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
  "description" text,
  "running_balance" numeric(15, 2),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gstin_registry" ADD CONSTRAINT "gstin_registry_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gstr_filings" ADD CONSTRAINT "gstr_filings_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gstr_filings" ADD CONSTRAINT "gstr_filings_gstin_id_gstin_registry_id_fk"
    FOREIGN KEY ("gstin_id") REFERENCES "public"."gstin_registry"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_users_id_fk"
    FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk"
    FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "coa_org_code_idx" ON "chart_of_accounts" ("org_id", "code");
CREATE INDEX IF NOT EXISTS "coa_org_type_idx" ON "chart_of_accounts" ("org_id", "type");
CREATE INDEX IF NOT EXISTS "coa_org_active_idx" ON "chart_of_accounts" ("org_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "gstin_registry_org_gstin_idx" ON "gstin_registry" ("org_id", "gstin");
CREATE INDEX IF NOT EXISTS "gstin_registry_org_idx" ON "gstin_registry" ("org_id");

CREATE INDEX IF NOT EXISTS "gstr_filings_org_gstin_month_year_idx" ON "gstr_filings" ("org_id", "gstin_id", "month", "year");
CREATE INDEX IF NOT EXISTS "gstr_filings_org_status_idx" ON "gstr_filings" ("org_id", "status");

CREATE INDEX IF NOT EXISTS "je_org_date_idx" ON "journal_entries" ("org_id", "date");
CREATE INDEX IF NOT EXISTS "je_org_status_idx" ON "journal_entries" ("org_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "je_org_number_idx" ON "journal_entries" ("org_id", "number");
CREATE INDEX IF NOT EXISTS "je_org_fy_period_idx" ON "journal_entries" ("org_id", "financial_year", "period");

CREATE INDEX IF NOT EXISTS "jel_je_idx" ON "journal_entry_lines" ("journal_entry_id");
CREATE INDEX IF NOT EXISTS "jel_account_idx" ON "journal_entry_lines" ("account_id");
CREATE INDEX IF NOT EXISTS "jel_org_account_idx" ON "journal_entry_lines" ("org_id", "account_id");
