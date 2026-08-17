ALTER TABLE "asset_types" ADD COLUMN "asset_account_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_types" ADD COLUMN "accumulated_depreciation_account_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_types" ADD COLUMN "depreciation_expense_account_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "asset_account_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "accumulated_depreciation_account_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "depreciation_expense_account_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_asset_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("asset_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_accumulated_depreciation_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("accumulated_depreciation_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_depreciation_expense_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("asset_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_accumulated_depreciation_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("accumulated_depreciation_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_depreciation_expense_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
