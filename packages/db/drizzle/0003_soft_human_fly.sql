CREATE TABLE IF NOT EXISTS "csm_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"account_id" uuid,
	"contact_id" uuid,
	"requester_id" uuid,
	"assignee_id" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "number" text DEFAULT 'SURV-000' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csm_cases" ADD CONSTRAINT "csm_cases_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csm_cases_org_idx" ON "csm_cases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csm_cases_status_idx" ON "csm_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csm_cases_priority_idx" ON "csm_cases" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csm_cases_account_idx" ON "csm_cases" USING btree ("account_id");