ALTER TABLE "okr_objectives" ADD COLUMN "parent_objective_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_parent_objective_id_okr_objectives_id_fk" FOREIGN KEY ("parent_objective_id") REFERENCES "public"."okr_objectives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_objectives_parent_idx" ON "okr_objectives" USING btree ("parent_objective_id");