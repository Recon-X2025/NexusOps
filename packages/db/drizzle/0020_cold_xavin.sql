CREATE TYPE "public"."leave_accrual_event_type" AS ENUM('accrual', 'carry_forward', 'lapse', 'encashment');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_accrual_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"event_type" "leave_accrual_event_type" NOT NULL,
	"year" integer NOT NULL,
	"month" integer,
	"days" numeric(6, 1) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"annual_entitlement_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"monthly_accrual_days" numeric(5, 1),
	"max_carry_forward_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"encashable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_accrual_events" ADD CONSTRAINT "leave_accrual_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_accrual_events" ADD CONSTRAINT "leave_accrual_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_accrual_events" ADD CONSTRAINT "leave_accrual_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_accrual_events_accrual_period_idx" ON "leave_accrual_events" USING btree ("employee_id","type","event_type","year","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_accrual_events_org_idx" ON "leave_accrual_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_accrual_events_employee_idx" ON "leave_accrual_events" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_policies_org_type_idx" ON "leave_policies" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_policies_org_idx" ON "leave_policies" USING btree ("org_id");