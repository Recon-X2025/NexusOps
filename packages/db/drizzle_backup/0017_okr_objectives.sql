-- OKR tables (align DB with packages/db/src/schema/hr.ts); required for dashboard.getMetrics activeOkrs count.

DO $$ BEGIN
  CREATE TYPE "public"."okr_cycle" AS ENUM('q1', 'q2', 'q3', 'q4', 'annual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."okr_status" AS ENUM('draft', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."kr_status" AS ENUM('on_track', 'at_risk', 'behind', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "okr_objectives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "cycle" "okr_cycle" NOT NULL DEFAULT 'q1',
  "year" integer NOT NULL,
  "status" "okr_status" NOT NULL DEFAULT 'draft',
  "overall_progress" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "okr_objectives_org_idx" ON "okr_objectives" ("org_id");
CREATE INDEX IF NOT EXISTS "okr_objectives_owner_idx" ON "okr_objectives" ("owner_id");

CREATE TABLE IF NOT EXISTS "okr_key_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "objective_id" uuid NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "target_value" numeric(12, 2) NOT NULL DEFAULT '100',
  "current_value" numeric(12, 2) NOT NULL DEFAULT '0',
  "unit" text NOT NULL DEFAULT '%',
  "status" "kr_status" NOT NULL DEFAULT 'on_track',
  "due_date" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
