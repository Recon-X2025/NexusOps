ALTER TABLE "sla_definitions" ADD COLUMN "display_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "category" text DEFAULT 'IT' NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "metric" text DEFAULT 'Resolution Time' NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "schedule" text DEFAULT '24x7' NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "business_hours_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "pause_on_hold" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sla_definitions" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;