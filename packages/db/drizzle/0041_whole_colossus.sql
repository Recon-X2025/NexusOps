CREATE TYPE "public"."statutory_metric_key" AS ENUM('pf_wage_ceiling', 'esi_wage_ceiling', 'pt_slab', 'lwf_rate');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "statutory_ceilings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"metric_key" "statutory_metric_key" NOT NULL,
	"state_code" text,
	"value" numeric(14, 2),
	"slabs_json" jsonb,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "statutory_ceilings" ADD CONSTRAINT "statutory_ceilings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statutory_ceilings_lookup_idx" ON "statutory_ceilings" USING btree ("metric_key","state_code","effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statutory_ceilings_org_idx" ON "statutory_ceilings" USING btree ("org_id");