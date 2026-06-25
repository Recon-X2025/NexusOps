CREATE TABLE IF NOT EXISTS "reorder_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"threshold_qty" integer DEFAULT 5 NOT NULL,
	"reorder_qty" integer DEFAULT 20 NOT NULL,
	"is_automated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kb_articles" ADD COLUMN "matter_id" uuid;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "reporter_id" uuid;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "investigations" ADD COLUMN "linked_matter_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reorder_policies" ADD CONSTRAINT "reorder_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reorder_policies" ADD CONSTRAINT "reorder_policies_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reorder_policies_org_idx" ON "reorder_policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reorder_policies_item_idx" ON "reorder_policies" USING btree ("item_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_matter_id_legal_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investigations" ADD CONSTRAINT "investigations_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investigations" ADD CONSTRAINT "investigations_linked_matter_id_legal_matters_id_fk" FOREIGN KEY ("linked_matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "csm_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "priority" text NOT NULL DEFAULT 'medium',
  "account_id" uuid,
  "contact_id" uuid,
  "requester_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "assignee_id" uuid,
  "resolution" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "csm_cases_org_number_idx" ON "csm_cases" USING btree ("org_id", "number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csm_cases_org_idx" ON "csm_cases" USING btree ("org_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
