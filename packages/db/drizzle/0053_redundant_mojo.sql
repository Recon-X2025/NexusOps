CREATE TABLE IF NOT EXISTS "shift_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_minutes" integer DEFAULT 540 NOT NULL,
	"duration_minutes" integer DEFAULT 480 NOT NULL,
	"grace_minutes" integer DEFAULT 10 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "shift_schedule_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_schedules_org_idx" ON "shift_schedules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shift_schedules_org_name_idx" ON "shift_schedules" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shift_schedules_org_default_idx" ON "shift_schedules" USING btree ("org_id") WHERE "shift_schedules"."is_default" = true;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_shift_schedule_id_shift_schedules_id_fk" FOREIGN KEY ("shift_schedule_id") REFERENCES "public"."shift_schedules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
