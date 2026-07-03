CREATE TABLE IF NOT EXISTS "gratuity_accruals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"basic_plus_da" numeric(12, 2) DEFAULT '0' NOT NULL,
	"accrual_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cumulative_accrued" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gratuity_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"last_drawn_basic_plus_da" numeric(12, 2) DEFAULT '0' NOT NULL,
	"completed_years" integer DEFAULT 0 NOT NULL,
	"trailing_months" integer DEFAULT 0 NOT NULL,
	"counted_years" integer DEFAULT 0 NOT NULL,
	"eligible" boolean DEFAULT false NOT NULL,
	"gross_gratuity" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gratuity_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"capped_at_ceiling" boolean DEFAULT false NOT NULL,
	"reason" text,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gratuity_accruals" ADD CONSTRAINT "gratuity_accruals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gratuity_accruals" ADD CONSTRAINT "gratuity_accruals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gratuity_settlements" ADD CONSTRAINT "gratuity_settlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gratuity_settlements" ADD CONSTRAINT "gratuity_settlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gratuity_settlements" ADD CONSTRAINT "gratuity_settlements_settled_by_id_users_id_fk" FOREIGN KEY ("settled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gratuity_accruals_emp_period_idx" ON "gratuity_accruals" USING btree ("employee_id","year","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gratuity_accruals_org_idx" ON "gratuity_accruals" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gratuity_settlements_emp_idx" ON "gratuity_settlements" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gratuity_settlements_org_idx" ON "gratuity_settlements" USING btree ("org_id");