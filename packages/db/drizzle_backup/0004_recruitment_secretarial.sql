-- NexusOps Phase 3 — Recruitment (ATS) + Corporate Secretarial
-- Apply on production when tables are missing:
--   docker exec -i nexusops-postgres-1 psql -U nexusops -d nexusops < packages/db/drizzle/0004_recruitment_secretarial.sql
-- Idempotent: safe to re-run (skips existing objects).

-- ── Enums (recruitment) ──────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."job_status" AS ENUM('draft', 'open', 'on_hold', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'freelance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."candidate_stage" AS ENUM('applied', 'screening', 'phone_screen', 'technical', 'panel', 'hr_round', 'offer', 'hired', 'rejected', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."interview_type" AS ENUM('phone', 'video', 'onsite', 'technical', 'case_study', 'hr'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'revoked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."candidate_source" AS ENUM('linkedin', 'naukri', 'indeed', 'referral', 'agency', 'website', 'campus', 'internal', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Enums (secretarial) ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."board_meeting_type" AS ENUM('board', 'audit_committee', 'nomination_committee', 'compensation_committee', 'agm', 'egm', 'creditors'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."board_meeting_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'adjourned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."board_resolution_type" AS ENUM('ordinary', 'special', 'board', 'circular'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."board_resolution_status" AS ENUM('draft', 'passed', 'rejected', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."secretarial_filing_status" AS ENUM('upcoming', 'in_progress', 'filed', 'overdue', 'not_applicable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."share_class" AS ENUM('equity', 'preference', 'esop_pool', 'convertible'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."esop_event" AS ENUM('grant', 'vest', 'exercise', 'lapse', 'cancel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Recruitment tables ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "job_requisitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "number" text NOT NULL,
  "title" text NOT NULL,
  "department" text NOT NULL,
  "location" text,
  "work_mode" text,
  "type" "job_type" DEFAULT 'full_time' NOT NULL,
  "level" "job_level" DEFAULT 'mid' NOT NULL,
  "status" "job_status" DEFAULT 'draft' NOT NULL,
  "openings" integer DEFAULT 1 NOT NULL,
  "filled" integer DEFAULT 0 NOT NULL,
  "description" text,
  "requirements" text,
  "nice_to_have" text,
  "salary_min" integer,
  "salary_max" integer,
  "currency" text DEFAULT 'INR',
  "budget_code" text,
  "hiring_manager_id" uuid REFERENCES "users"("id"),
  "recruiter_id" uuid REFERENCES "users"("id"),
  "approver_id" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "target_date" timestamp,
  "closed_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "job_req_org_idx" ON "job_requisitions" ("org_id");
CREATE INDEX IF NOT EXISTS "job_req_status_idx" ON "job_requisitions" ("org_id", "status");

CREATE TABLE IF NOT EXISTS "candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "location" text,
  "current_title" text,
  "current_company" text,
  "experience_years" integer,
  "skills" text[] DEFAULT '{}',
  "resume_url" text,
  "linkedin_url" text,
  "source" "candidate_source" DEFAULT 'other',
  "referred_by" uuid REFERENCES "users"("id"),
  "notes" text,
  "tags" text[] DEFAULT '{}',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "candidate_org_idx" ON "candidates" ("org_id");

CREATE TABLE IF NOT EXISTS "candidate_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id"),
  "job_id" uuid NOT NULL REFERENCES "job_requisitions"("id"),
  "stage" "candidate_stage" DEFAULT 'applied' NOT NULL,
  "rating" integer,
  "feedback" text,
  "rejection_reason" text,
  "assigned_to" uuid REFERENCES "users"("id"),
  "applied_at" timestamp DEFAULT now() NOT NULL,
  "stage_updated_at" timestamp DEFAULT now() NOT NULL,
  "hired_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "app_org_idx" ON "candidate_applications" ("org_id");
CREATE INDEX IF NOT EXISTS "app_job_idx" ON "candidate_applications" ("job_id");
CREATE INDEX IF NOT EXISTS "app_candidate_idx" ON "candidate_applications" ("candidate_id");
CREATE INDEX IF NOT EXISTS "app_stage_idx" ON "candidate_applications" ("org_id", "stage");
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_application_job_unique" ON "candidate_applications" ("candidate_id", "job_id");

CREATE TABLE IF NOT EXISTS "interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "application_id" uuid NOT NULL REFERENCES "candidate_applications"("id"),
  "type" "interview_type" DEFAULT 'video' NOT NULL,
  "status" "interview_status" DEFAULT 'scheduled' NOT NULL,
  "title" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "duration_mins" integer DEFAULT 60,
  "location" text,
  "interviewers" uuid[] DEFAULT '{}',
  "scorecard" jsonb DEFAULT '{}',
  "overall_rating" integer,
  "decision" text,
  "notes" text,
  "meeting_link" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "interview_org_idx" ON "interviews" ("org_id");
CREATE INDEX IF NOT EXISTS "interview_app_idx" ON "interviews" ("application_id");

CREATE TABLE IF NOT EXISTS "job_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "application_id" uuid NOT NULL REFERENCES "candidate_applications"("id"),
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id"),
  "status" "offer_status" DEFAULT 'draft' NOT NULL,
  "title" text NOT NULL,
  "department" text,
  "base_salary" integer,
  "variable_pay" integer,
  "joining_bonus" integer,
  "currency" text DEFAULT 'INR',
  "start_date" timestamp,
  "expiry_date" timestamp,
  "components" jsonb DEFAULT '{}',
  "notes" text,
  "sent_at" timestamp,
  "responded_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "offer_org_idx" ON "job_offers" ("org_id");

-- ── Secretarial tables ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "board_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "number" text NOT NULL,
  "type" "board_meeting_type" DEFAULT 'board' NOT NULL,
  "status" "board_meeting_status" DEFAULT 'scheduled' NOT NULL,
  "title" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "duration_mins" integer DEFAULT 120,
  "venue" text,
  "video_link" text,
  "agenda" jsonb DEFAULT '[]',
  "attendees" jsonb DEFAULT '[]',
  "quorum_met" boolean,
  "minutes_url" text,
  "minutes_draft" text,
  "chairperson_id" uuid REFERENCES "users"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "board_meeting_org_idx" ON "board_meetings" ("org_id");
CREATE INDEX IF NOT EXISTS "board_meeting_status_idx" ON "board_meetings" ("org_id", "status");

CREATE TABLE IF NOT EXISTS "board_resolutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "meeting_id" uuid REFERENCES "board_meetings"("id"),
  "number" text NOT NULL,
  "type" "board_resolution_type" DEFAULT 'board' NOT NULL,
  "status" "board_resolution_status" DEFAULT 'draft' NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "passed_at" timestamp,
  "votes_for" integer DEFAULT 0,
  "votes_against" integer DEFAULT 0,
  "abstentions" integer DEFAULT 0,
  "attachment_url" text,
  "tags" text[] DEFAULT '{}',
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "resolution_org_idx" ON "board_resolutions" ("org_id");

CREATE TABLE IF NOT EXISTS "secretarial_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "form_number" text NOT NULL,
  "title" text NOT NULL,
  "authority" text NOT NULL,
  "category" text NOT NULL,
  "status" "secretarial_filing_status" DEFAULT 'upcoming' NOT NULL,
  "due_date" timestamp NOT NULL,
  "filed_at" timestamp,
  "srn" text,
  "fees" integer,
  "penalty_paid" integer DEFAULT 0,
  "notes" text,
  "attachment_url" text,
  "assigned_to" uuid REFERENCES "users"("id"),
  "fy" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "filing_org_idx" ON "secretarial_filings" ("org_id");
CREATE INDEX IF NOT EXISTS "filing_due_date_idx" ON "secretarial_filings" ("org_id", "due_date");

CREATE TABLE IF NOT EXISTS "share_capital" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "folio" text NOT NULL,
  "holder_name" text NOT NULL,
  "holder_type" text DEFAULT 'individual',
  "share_class" "share_class" DEFAULT 'equity' NOT NULL,
  "nominal_value" integer DEFAULT 10 NOT NULL,
  "quantity" integer NOT NULL,
  "paid_up_value" integer,
  "pan" text,
  "demat_account" text,
  "address" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "share_capital_org_idx" ON "share_capital" ("org_id");

CREATE TABLE IF NOT EXISTS "esop_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "grant_number" text NOT NULL,
  "employee_id" uuid REFERENCES "users"("id"),
  "employee_name" text NOT NULL,
  "event" "esop_event" DEFAULT 'grant' NOT NULL,
  "options" integer NOT NULL,
  "exercise_price" integer NOT NULL,
  "grant_date" timestamp NOT NULL,
  "vesting_start" timestamp,
  "vesting_end" timestamp,
  "vesting_schedule" jsonb DEFAULT '[]',
  "exercise_window" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "esop_grant_org_idx" ON "esop_grants" ("org_id");

CREATE TABLE IF NOT EXISTS "company_directors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "din" text NOT NULL,
  "designation" text NOT NULL,
  "category" text DEFAULT 'non_executive',
  "dob" timestamp,
  "pan" text,
  "email" text,
  "phone" text,
  "appointed_at" timestamp,
  "resigned_at" timestamp,
  "is_active" boolean DEFAULT true NOT NULL,
  "kyc_status" text DEFAULT 'pending',
  "kyc_due_date" timestamp,
  "address" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "director_org_idx" ON "company_directors" ("org_id");
