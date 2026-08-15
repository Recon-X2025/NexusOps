CREATE TYPE "public"."lead_authority" AS ENUM('decision_maker', 'influencer', 'evaluator', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."lead_budget_band" AS ENUM('under_1l', '1l_5l', '5l_25l', 'over_25l', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."lead_timeline" AS ENUM('immediate', 'this_quarter', 'next_quarter', 'later', 'unknown');--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "budget_band" "lead_budget_band" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "budget_note" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "authority" "lead_authority" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "need" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "timeline" "lead_timeline" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "estimated_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "expected_close" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "next_action_date" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_lead_idx" ON "crm_activities" USING btree ("lead_id");