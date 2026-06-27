CREATE TABLE IF NOT EXISTS "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" "deal_stage" NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'text-muted-foreground bg-muted' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_pipeline_stages_org_key_idx" ON "crm_pipeline_stages" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_pipeline_stages_org_rank_idx" ON "crm_pipeline_stages" USING btree ("org_id","rank");