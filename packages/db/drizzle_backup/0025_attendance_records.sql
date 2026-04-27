-- HR attendance (aligned with packages/db/src/schema/hr.ts)
DO $$ BEGIN
 CREATE TYPE "public"."attendance_status" AS ENUM(
   'present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'weekend'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."shift_type" AS ENUM(
   'morning', 'afternoon', 'night', 'flexible', 'remote'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "date" timestamp with time zone NOT NULL,
  "status" "attendance_status" DEFAULT 'present' NOT NULL,
  "shift_type" "shift_type" DEFAULT 'flexible' NOT NULL,
  "check_in" timestamp with time zone,
  "check_out" timestamp with time zone,
  "hours_worked" numeric(4, 2),
  "late_minutes" integer DEFAULT 0 NOT NULL,
  "overtime_minutes" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_org_employee_date_idx"
  ON "attendance_records" ("org_id", "employee_id", "date");
CREATE INDEX IF NOT EXISTS "attendance_org_date_idx"
  ON "attendance_records" ("org_id", "date");
