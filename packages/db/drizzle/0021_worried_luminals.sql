CREATE TYPE "public"."depreciation_method" AS ENUM('SLM', 'WDV');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_depreciation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"method" "depreciation_method" DEFAULT 'SLM' NOT NULL,
	"cost" numeric(14, 2) NOT NULL,
	"salvage_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"useful_life_years" integer NOT NULL,
	"wdv_rate" numeric(6, 4),
	"accumulated_depreciation" numeric(14, 2) DEFAULT '0' NOT NULL,
	"book_value" numeric(14, 2) NOT NULL,
	"periods_elapsed" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"fully_depreciated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_depreciation_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"period" integer NOT NULL,
	"opening_book_value" numeric(14, 2) NOT NULL,
	"depreciation" numeric(14, 2) NOT NULL,
	"accumulated_depreciation" numeric(14, 2) NOT NULL,
	"closing_book_value" numeric(14, 2) NOT NULL,
	"journal_entry_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_depreciation_asset_idx" ON "asset_depreciation" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_depreciation_org_idx" ON "asset_depreciation" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_depreciation_entries_asset_period_idx" ON "asset_depreciation_entries" USING btree ("asset_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_depreciation_entries_org_idx" ON "asset_depreciation_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_depreciation_entries_asset_idx" ON "asset_depreciation_entries" USING btree ("asset_id");