CREATE TYPE "public"."gstr2b_recon_status" AS ENUM('matched', 'mismatch', 'missing_in_2b', 'missing_in_books');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gstr2b_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"gstin_id" uuid,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"financial_year" text NOT NULL,
	"total_lines" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"mismatch_count" integer DEFAULT 0 NOT NULL,
	"missing_in_2b_count" integer DEFAULT 0 NOT NULL,
	"missing_in_books_count" integer DEFAULT 0 NOT NULL,
	"portal_itc" numeric(15, 2) DEFAULT '0' NOT NULL,
	"eligible_itc" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gstr2b_recon_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"supplier_gstin" text NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" text,
	"status" "gstr2b_recon_status" NOT NULL,
	"book_taxable" numeric(15, 2),
	"book_igst" numeric(15, 2),
	"book_cgst" numeric(15, 2),
	"book_sgst" numeric(15, 2),
	"portal_taxable" numeric(15, 2),
	"portal_igst" numeric(15, 2),
	"portal_cgst" numeric(15, 2),
	"portal_sgst" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr2b_imports" ADD CONSTRAINT "gstr2b_imports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr2b_imports" ADD CONSTRAINT "gstr2b_imports_gstin_id_gstin_registry_id_fk" FOREIGN KEY ("gstin_id") REFERENCES "public"."gstin_registry"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr2b_imports" ADD CONSTRAINT "gstr2b_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr2b_recon_lines" ADD CONSTRAINT "gstr2b_recon_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr2b_recon_lines" ADD CONSTRAINT "gstr2b_recon_lines_import_id_gstr2b_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."gstr2b_imports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gstr2b_imports_org_gstin_period_idx" ON "gstr2b_imports" USING btree ("org_id","gstin_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstr2b_imports_org_idx" ON "gstr2b_imports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstr2b_recon_lines_import_idx" ON "gstr2b_recon_lines" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstr2b_recon_lines_org_status_idx" ON "gstr2b_recon_lines" USING btree ("org_id","status");