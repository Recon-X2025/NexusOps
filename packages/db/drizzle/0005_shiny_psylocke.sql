CREATE TYPE "public"."bank_statement_status" AS ENUM('importing', 'in_progress', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."bank_txn_status" AS ENUM('unmatched', 'matched', 'ignored');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"statement_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "bank_statement_status" DEFAULT 'in_progress' NOT NULL,
	"txn_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"txn_date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"amount" numeric(15, 2) NOT NULL,
	"status" "bank_txn_status" DEFAULT 'unmatched' NOT NULL,
	"matched_journal_entry_id" uuid,
	"match_score" integer,
	"matched_at" timestamp with time zone,
	"matched_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("matched_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_by_id_users_id_fk" FOREIGN KEY ("matched_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statements_org_account_idx" ON "bank_statements" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statements_org_status_idx" ON "bank_statements" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_txns_org_statement_idx" ON "bank_transactions" USING btree ("org_id","statement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_txns_org_status_idx" ON "bank_transactions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_txns_matched_je_idx" ON "bank_transactions" USING btree ("matched_journal_entry_id");