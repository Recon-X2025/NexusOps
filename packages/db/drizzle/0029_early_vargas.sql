CREATE TABLE IF NOT EXISTS "lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"event_type" text DEFAULT 'employee_transition' NOT NULL,
	"hr_task_status" text DEFAULT 'pending' NOT NULL,
	"it_task_status" text DEFAULT 'pending' NOT NULL,
	"payroll_compliance" text DEFAULT 'no' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offboarding_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text,
	"separation_docs" text,
	"clearance_docs" text,
	"security_clearance" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"ff_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offboarding_details" ADD CONSTRAINT "offboarding_details_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offboarding_details" ADD CONSTRAINT "offboarding_details_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lifecycle_events_org_idx" ON "lifecycle_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lifecycle_events_emp_idx" ON "lifecycle_events" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offboarding_details_org_idx" ON "offboarding_details" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offboarding_details_emp_idx" ON "offboarding_details" USING btree ("employee_id");