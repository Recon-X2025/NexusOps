CREATE TYPE "public"."inventory_valuation_method" AS ENUM('FIFO', 'WAC');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_cost_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "valuation_method" "inventory_valuation_method" DEFAULT 'WAC' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "avg_unit_cost" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "stock_value" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "unit_cost" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "cogs" numeric(15, 2);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_cost_layers_org_idx" ON "inventory_cost_layers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_cost_layers_item_idx" ON "inventory_cost_layers" USING btree ("item_id");