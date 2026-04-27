DO $$ BEGIN CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'weekend'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kr_status" AS ENUM('on_track', 'at_risk', 'behind', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."okr_cycle" AS ENUM('q1', 'q2', 'q3', 'q4', 'annual'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."okr_status" AS ENUM('draft', 'active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."public_holiday_type" AS ENUM('national', 'restricted', 'state', 'company'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."shift_type" AS ENUM('morning', 'afternoon', 'night', 'flexible', 'remote'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."expense_category" AS ENUM('travel', 'accommodation', 'food', 'meals', 'fuel', 'transport', 'communication', 'office_supplies', 'software', 'marketing', 'client_entertainment', 'training', 'entertainment', 'medical', 'miscellaneous', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."expense_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'reimbursed', 'paid', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."goal_status" AS ENUM('draft', 'active', 'at_risk', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."rating_scale" AS ENUM('1', '2', '3', '4', '5'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."review_status" AS ENUM('draft', 'self_review', 'peer_review', 'manager_review', 'calibration', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."candidate_source" AS ENUM('linkedin', 'naukri', 'indeed', 'referral', 'agency', 'website', 'campus', 'internal', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."candidate_stage" AS ENUM('applied', 'screening', 'phone_screen', 'technical', 'panel', 'hr_round', 'offer', 'hired', 'rejected', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."interview_type" AS ENUM('phone', 'video', 'onsite', 'technical', 'case_study', 'hr'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_status" AS ENUM('draft', 'open', 'on_hold', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'freelance'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'revoked'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."esop_event" AS ENUM('grant', 'vest', 'exercise', 'lapse', 'cancel'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."secretarial_filing_status" AS ENUM('upcoming', 'in_progress', 'filed', 'overdue', 'not_applicable'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."board_meeting_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'adjourned'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."board_meeting_type" AS ENUM('board', 'audit_committee', 'nomination_committee', 'compensation_committee', 'agm', 'egm', 'creditors'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."board_resolution_status" AS ENUM('draft', 'passed', 'rejected', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."board_resolution_type" AS ENUM('ordinary', 'special', 'board', 'circular'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."share_class" AS ENUM('equity', 'preference', 'esop_pool', 'convertible'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."account_sub_type" AS ENUM('bank', 'cash', 'accounts_receivable', 'other_current_asset', 'fixed_asset', 'accumulated_depreciation', 'other_asset', 'accounts_payable', 'credit_card', 'other_current_liability', 'long_term_liability', 'owners_equity', 'retained_earnings', 'share_capital', 'income', 'other_income', 'cost_of_goods_sold', 'expense', 'other_expense', 'payroll_expense', 'depreciation'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense', 'contra_asset', 'contra_liability', 'contra_equity', 'contra_income', 'contra_expense'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."gstr_filing_status" AS ENUM('draft', 'ready', 'filed', 'accepted', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed', 'voided'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."journal_entry_type" AS ENUM('manual', 'invoice', 'payment', 'payroll', 'depreciation', 'closing', 'opening', 'reversal', 'gst_liability', 'tds_deduction'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."custom_field_entity" AS ENUM('ticket', 'asset', 'employee', 'contract', 'vendor', 'project', 'change_request', 'lead', 'invoice', 'expense_claim', 'okr_objective'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'textarea', 'number', 'decimal', 'boolean', 'date', 'datetime', 'select', 'multi_select', 'url', 'email', 'phone', 'user_reference', 'file', 'json'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."esign_provider" AS ENUM('emudhra', 'docusign', 'internal_otp'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."esign_request_status" AS ENUM('draft', 'sent', 'viewed', 'signed', 'declined', 'expired', 'voided', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."esigner_status" AS ENUM('pending', 'viewed', 'signed', 'declined'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."document_acl_permission" AS ENUM('read', 'write', 'delete', 'share'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."document_acl_principal_type" AS ENUM('user', 'role', 'team', 'everyone_in_org'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."document_classification" AS ENUM('public', 'internal', 'confidential', 'restricted', 'pii'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."document_scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
-- ALTER TYPE "public"."ticket_status_category" ADD VALUE 'pending' BEFORE 'resolved';--> statement-breakpoint
-- ALTER TYPE "public"."project_status" ADD VALUE 'proposed' BEFORE 'planning';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cin" text,
	"parent_legal_entity_id" uuid,
	"holding_percentage" numeric(6, 2),
	"material_subsidiary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_assignee_id" uuid,
	"to_assignee_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"met_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "expense_category" DEFAULT 'miscellaneous' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"status" "expense_status" DEFAULT 'draft' NOT NULL,
	"receipt_url" text,
	"project_code" text,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"reimbursed_at" timestamp with time zone,
	"payment_mode" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "okr_key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_value" numeric(12, 2) DEFAULT '100' NOT NULL,
	"current_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT '%' NOT NULL,
	"status" "kr_status" DEFAULT 'on_track' NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "okr_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cycle" "okr_cycle" DEFAULT 'q1' NOT NULL,
	"year" integer NOT NULL,
	"status" "okr_status" DEFAULT 'draft' NOT NULL,
	"overall_progress" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type" "public_holiday_type" DEFAULT 'national' NOT NULL,
	"state_code" text,
	"year" integer NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_article_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_blackout_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risk_control_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"title" text NOT NULL,
	"storage_uri" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_project_id" uuid NOT NULL,
	"to_project_id" uuid NOT NULL,
	"dependency_type" text DEFAULT 'finish_to_start' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategic_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"theme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"receipt_url" text,
	"receipt_file_name" text,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"merchant" text,
	"is_billable" boolean DEFAULT false NOT NULL,
	"project_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"submitted_by_id" uuid NOT NULL,
	"approver_id" uuid,
	"status" "expense_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reimbursable_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"business_purpose" text,
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cycle_id" uuid,
	"owner_id" uuid NOT NULL,
	"parent_goal_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"goal_type" text DEFAULT 'individual' NOT NULL,
	"status" "goal_status" DEFAULT 'draft' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target_value" numeric(14, 2),
	"current_value" numeric(14, 2),
	"unit" text,
	"due_date" timestamp with time zone,
	"tags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"reviewer_role" text DEFAULT 'manager' NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"overall_rating" "rating_scale",
	"self_rating" "rating_scale",
	"strengths_text" text,
	"areas_for_growth_text" text,
	"manager_comments" text,
	"goals_achieved" integer DEFAULT 0,
	"goals_total" integer DEFAULT 0,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'annual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"self_review_deadline" timestamp with time zone,
	"peer_review_deadline" timestamp with time zone,
	"manager_review_deadline" timestamp with time zone,
	"enable_360" text DEFAULT 'false',
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" "candidate_stage" DEFAULT 'applied' NOT NULL,
	"rating" integer,
	"feedback" text,
	"rejection_reason" text,
	"assigned_to" uuid,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"stage_updated_at" timestamp DEFAULT now() NOT NULL,
	"hired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
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
	"referred_by" uuid,
	"notes" text,
	"tags" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "interview_type" DEFAULT 'video' NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_mins" integer DEFAULT 60,
	"location" text,
	"interviewers" uuid[] DEFAULT '{}',
	"scorecard" jsonb DEFAULT '{}'::jsonb,
	"overall_rating" integer,
	"decision" text,
	"notes" text,
	"meeting_link" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"base_salary" integer,
	"variable_pay" integer,
	"joining_bonus" integer,
	"currency" text DEFAULT 'INR',
	"start_date" timestamp,
	"expiry_date" timestamp,
	"components" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"sent_at" timestamp,
	"responded_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
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
	"hiring_manager_id" uuid,
	"recruiter_id" uuid,
	"approver_id" uuid,
	"approved_at" timestamp,
	"target_date" timestamp,
	"closed_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"type" "board_meeting_type" DEFAULT 'board' NOT NULL,
	"status" "board_meeting_status" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_mins" integer DEFAULT 120,
	"venue" text,
	"video_link" text,
	"agenda" jsonb DEFAULT '[]'::jsonb,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"quorum_met" boolean,
	"minutes_url" text,
	"minutes_draft" text,
	"chairperson_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"meeting_id" uuid,
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
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_directors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "esop_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grant_number" text NOT NULL,
	"employee_id" uuid,
	"employee_name" text NOT NULL,
	"event" "esop_event" DEFAULT 'grant' NOT NULL,
	"options" integer NOT NULL,
	"exercise_price" integer NOT NULL,
	"grant_date" timestamp NOT NULL,
	"vesting_start" timestamp,
	"vesting_end" timestamp,
	"vesting_schedule" jsonb DEFAULT '[]'::jsonb,
	"exercise_window" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secretarial_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
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
	"assigned_to" uuid,
	"fy" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_capital" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"sub_type" "account_sub_type",
	"parent_id" uuid,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"opening_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"gstin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gstin_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"gstin" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"state_code" text NOT NULL,
	"state_name" text,
	"address" text,
	"registration_date" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invoice_series_prefix" text,
	"current_invoice_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gstr_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"gstin_id" uuid,
	"form_type" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"financial_year" text NOT NULL,
	"status" "gstr_filing_status" DEFAULT 'draft' NOT NULL,
	"total_output_tax" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_itc" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(15, 2) DEFAULT '0' NOT NULL,
	"json_payload" text,
	"filed_at" timestamp with time zone,
	"arn" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type" "journal_entry_type" DEFAULT 'manual' NOT NULL,
	"status" "journal_entry_status" DEFAULT 'draft' NOT NULL,
	"description" text,
	"reference" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
	"total_debit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_credit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"reversal_of_id" uuid,
	"created_by_id" uuid,
	"posted_by_id" uuid,
	"posted_at" timestamp with time zone,
	"financial_year" text,
	"period" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"running_balance" numeric(15, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity" "custom_field_entity" NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_field_type" DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_list_column" boolean DEFAULT false NOT NULL,
	"is_form_field" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_value" text,
	"group_name" text,
	"placeholder" text,
	"help_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"entity" "custom_field_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entity_type" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cci_combination_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notifiable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'tracking' NOT NULL,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_clause_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"jurisdiction" text DEFAULT 'IN' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_esign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"completed_at" timestamp with time zone,
	"audit_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "director_interest_disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"director_name" text NOT NULL,
	"din" text,
	"due_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dpdp_processing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_name" text NOT NULL,
	"purpose" text,
	"lawful_basis" text,
	"data_categories" text,
	"linked_privacy_matter_id" uuid,
	"dpo_sign_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fema_return_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"return_type" text NOT NULL,
	"due_at" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issuer_programme_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"matrix_key" text NOT NULL,
	"title" text NOT NULL,
	"closure_criterion" text,
	"status" text DEFAULT 'implemented' NOT NULL,
	"product_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_hold_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"matter_id" uuid,
	"contract_id" uuid,
	"custodian" text,
	"active" boolean DEFAULT true NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lodor_calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_code" text NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mca_filing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_code" text NOT NULL,
	"srn" text,
	"status" text DEFAULT 'prepared' NOT NULL,
	"due_at" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msme_payment_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"invoice_ref" text,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"interest_due" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privacy_breach_notification_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"regulator_name" text,
	"notification_offset_hours" integer DEFAULT 72 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "related_party_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"counterparty_name" text NOT NULL,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'INR' NOT NULL,
	"transaction_date" timestamp with time zone,
	"approval_resolution_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resource_read_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sec_incident_ticket_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sector_regulator_licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sector" text NOT NULL,
	"licence_number" text NOT NULL,
	"expires_at" timestamp with time zone,
	"conditions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shareholder_grievances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"reference" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"exchange_ref" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shareholder_voting_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"meeting_label" text NOT NULL,
	"resolution" text NOT NULL,
	"ballot_date" timestamp with time zone,
	"outcome" text,
	"votes_for" integer,
	"votes_against" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "statutory_register_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"register_type" text NOT NULL,
	"entry_key" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vulnerability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vulnerability_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"approved_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whistleblower_program_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"policy_version" text,
	"escalation_matrix" jsonb DEFAULT '[]'::jsonb,
	"retention_days" integer DEFAULT 2555,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xbrl_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"handoff_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"signer_id" uuid,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"geo_country" text,
	"geo_city" text,
	"otp_ref_id" text,
	"provider_payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "esign_provider" NOT NULL,
	"provider_envelope_id" text,
	"title" text NOT NULL,
	"message" text,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"document_storage_key" text NOT NULL,
	"document_sha256" text NOT NULL,
	"status" "esign_request_status" DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"signed_document_storage_key" text,
	"signed_document_sha256" text,
	"requested_by_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text,
	"routing_order" integer DEFAULT 1 NOT NULL,
	"status" "esigner_status" DEFAULT 'pending' NOT NULL,
	"signed_at" timestamp with time zone,
	"aadhaar_masked_hash" text,
	"certificate_hash" text,
	"internal_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_acls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"principal_type" "document_acl_principal_type" NOT NULL,
	"principal_id" uuid,
	"permission" "document_acl_permission" NOT NULL,
	"granted_by_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_days" integer NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"external_provider" text,
	"external_id" text,
	"parent_id" uuid,
	"folder_path" text,
	"classification" "document_classification" DEFAULT 'internal' NOT NULL,
	"scan_status" "document_scan_status" DEFAULT 'pending' NOT NULL,
	"scan_result" jsonb,
	"retention_policy_id" uuid,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"owner_id" uuid,
	"deleted_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "tickets_idempotency_key_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enrolled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "configuration_item_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "known_error_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "is_major_incident" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "sla_pause_reason_code" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "parent_ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "intake_channel" text DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "embedding_vector" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "external_source" text;--> statement-breakpoint
ALTER TABLE "ci_items" ADD COLUMN IF NOT EXISTS "external_key" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "job_grade" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "dotted_line_manager_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "pipeline_status" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "run_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "workflow_metadata" jsonb DEFAULT '{"errors":[],"approvals":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoice_flow" text DEFAULT 'payable' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_method" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD COLUMN IF NOT EXISTS "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "kms_key_id" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "dek_wrapped_b64" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN IF NOT EXISTS "risk_score" integer;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN IF NOT EXISTS "risk_questionnaire" jsonb;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "notes" jsonb;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD COLUMN IF NOT EXISTS "ir_playbook_checklist" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "external_fingerprint" text;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "scanner_source" text;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "remediation_sla_days" integer;--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "remediation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_risks" ADD COLUMN IF NOT EXISTS "attachment_refs" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "vendor_risks" ADD COLUMN IF NOT EXISTS "questionnaire_answers" jsonb;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "stamp_duty_status" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "registration_status" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "registration_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "initiative_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_target" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_actual" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "linked_application_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approval_tier" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "cnr" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "court_name" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "forum" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "next_hearing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "limitation_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "arbitration_seat" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "arbitration_institution" text;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "fulfillment_ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "fulfillment_checklist" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_from_assignee_id_users_id_fk" FOREIGN KEY ("from_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_handoffs" ADD CONSTRAINT "ticket_handoffs_to_assignee_id_users_id_fk" FOREIGN KEY ("to_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okr_key_results" ADD CONSTRAINT "okr_key_results_objective_id_okr_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."okr_objectives"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okr_key_results" ADD CONSTRAINT "okr_key_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_article_revisions" ADD CONSTRAINT "kb_article_revisions_article_id_kb_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."kb_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_article_revisions" ADD CONSTRAINT "kb_article_revisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_article_revisions" ADD CONSTRAINT "kb_article_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_blackout_windows" ADD CONSTRAINT "change_blackout_windows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_control_evidence" ADD CONSTRAINT "risk_control_evidence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_control_evidence" ADD CONSTRAINT "risk_control_evidence_control_id_risk_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."risk_controls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_control_evidence" ADD CONSTRAINT "risk_control_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_from_project_id_projects_id_fk" FOREIGN KEY ("from_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_to_project_id_projects_id_fk" FOREIGN KEY ("to_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_job_id_job_requisitions_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_candidate_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_application_id_candidate_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_hiring_manager_id_users_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_recruiter_id_users_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_chairperson_id_users_id_fk" FOREIGN KEY ("chairperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_directors" ADD CONSTRAINT "company_directors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secretarial_filings" ADD CONSTRAINT "secretarial_filings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secretarial_filings" ADD CONSTRAINT "secretarial_filings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_capital" ADD CONSTRAINT "share_capital_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstin_registry" ADD CONSTRAINT "gstin_registry_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr_filings" ADD CONSTRAINT "gstr_filings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gstr_filings" ADD CONSTRAINT "gstr_filings_gstin_id_gstin_registry_id_fk" FOREIGN KEY ("gstin_id") REFERENCES "public"."gstin_registry"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_users_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_field_definitions_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cci_combination_filings" ADD CONSTRAINT "cci_combination_filings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_clause_templates" ADD CONSTRAINT "contract_clause_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_esign_events" ADD CONSTRAINT "contract_esign_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_esign_events" ADD CONSTRAINT "contract_esign_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "director_interest_disclosures" ADD CONSTRAINT "director_interest_disclosures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_processing_activities" ADD CONSTRAINT "dpdp_processing_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dpdp_processing_activities" ADD CONSTRAINT "dpdp_processing_activities_linked_privacy_matter_id_legal_matters_id_fk" FOREIGN KEY ("linked_privacy_matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fema_return_records" ADD CONSTRAINT "fema_return_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issuer_programme_matrix" ADD CONSTRAINT "issuer_programme_matrix_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_hold_records" ADD CONSTRAINT "legal_hold_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_hold_records" ADD CONSTRAINT "legal_hold_records_matter_id_legal_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_hold_records" ADD CONSTRAINT "legal_hold_records_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lodor_calendar_entries" ADD CONSTRAINT "lodor_calendar_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mca_filing_records" ADD CONSTRAINT "mca_filing_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msme_payment_trackers" ADD CONSTRAINT "msme_payment_trackers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "privacy_breach_notification_profiles" ADD CONSTRAINT "privacy_breach_notification_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "related_party_transactions" ADD CONSTRAINT "related_party_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_read_audit_events" ADD CONSTRAINT "resource_read_audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_read_audit_events" ADD CONSTRAINT "resource_read_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sec_incident_ticket_links" ADD CONSTRAINT "sec_incident_ticket_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sec_incident_ticket_links" ADD CONSTRAINT "sec_incident_ticket_links_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sec_incident_ticket_links" ADD CONSTRAINT "sec_incident_ticket_links_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sector_regulator_licences" ADD CONSTRAINT "sector_regulator_licences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shareholder_grievances" ADD CONSTRAINT "shareholder_grievances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shareholder_voting_results" ADD CONSTRAINT "shareholder_voting_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "statutory_register_entries" ADD CONSTRAINT "statutory_register_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_exceptions" ADD CONSTRAINT "vulnerability_exceptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_exceptions" ADD CONSTRAINT "vulnerability_exceptions_vulnerability_id_vulnerabilities_id_fk" FOREIGN KEY ("vulnerability_id") REFERENCES "public"."vulnerabilities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerability_exceptions" ADD CONSTRAINT "vulnerability_exceptions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whistleblower_program_settings" ADD CONSTRAINT "whistleblower_program_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "xbrl_export_jobs" ADD CONSTRAINT "xbrl_export_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_audit" ADD CONSTRAINT "signature_audit_request_id_signature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_audit" ADD CONSTRAINT "signature_audit_signer_id_signature_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signature_signers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_request_id_signature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_internal_user_id_users_id_fk" FOREIGN KEY ("internal_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_acls" ADD CONSTRAINT "document_acls_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_acls" ADD CONSTRAINT "document_acls_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_retention_policies" ADD CONSTRAINT "document_retention_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_retention_policy_id_document_retention_policies_id_fk" FOREIGN KEY ("retention_policy_id") REFERENCES "public"."document_retention_policies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_entities_org_idx" ON "legal_entities" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_entities_org_code_idx" ON "legal_entities" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_handoffs_org_ticket_idx" ON "ticket_handoffs" USING btree ("org_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_org_employee_date_idx" ON "attendance_records" USING btree ("org_id","employee_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_org_date_idx" ON "attendance_records" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_org_idx" ON "expense_claims" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_employee_idx" ON "expense_claims" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_status_idx" ON "expense_claims" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_number_org_idx" ON "expense_claims" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_objectives_org_idx" ON "okr_objectives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_objectives_owner_idx" ON "okr_objectives" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_holidays_org_year_idx" ON "public_holidays" USING btree ("org_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_holidays_org_date_idx" ON "public_holidays" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_article_revisions_article_idx" ON "kb_article_revisions" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kb_article_revisions_article_version_uidx" ON "kb_article_revisions" USING btree ("article_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_blackout_windows_org_idx" ON "change_blackout_windows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_control_evidence_org_idx" ON "risk_control_evidence" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_control_evidence_control_idx" ON "risk_control_evidence" USING btree ("control_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_org_idx" ON "project_dependencies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_from_idx" ON "project_dependencies" USING btree ("from_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_to_idx" ON "project_dependencies" USING btree ("to_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_dependencies_pair_uidx" ON "project_dependencies" USING btree ("from_project_id","to_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategic_initiatives_org_idx" ON "strategic_initiatives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_items_report_idx" ON "expense_items" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_items_org_idx" ON "expense_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_reports_org_idx" ON "expense_reports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_reports_submitter_idx" ON "expense_reports" USING btree ("org_id","submitted_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_reports_status_idx" ON "expense_reports" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_org_idx" ON "goals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_owner_idx" ON "goals" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_cycle_idx" ON "goals" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_status_idx" ON "goals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_reviews_org_idx" ON "performance_reviews" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_reviews_cycle_idx" ON "performance_reviews" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_reviews_reviewee_idx" ON "performance_reviews" USING btree ("org_id","reviewee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_cycles_org_idx" ON "review_cycles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_cycles_status_idx" ON "review_cycles" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_org_idx" ON "candidate_applications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_job_idx" ON "candidate_applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_candidate_idx" ON "candidate_applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_stage_idx" ON "candidate_applications" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_org_idx" ON "candidates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_org_idx" ON "interviews" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_app_idx" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offer_org_idx" ON "job_offers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_req_org_idx" ON "job_requisitions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_req_status_idx" ON "job_requisitions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_meeting_org_idx" ON "board_meetings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_meeting_status_idx" ON "board_meetings" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resolution_org_idx" ON "board_resolutions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "director_org_idx" ON "company_directors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "esop_grant_org_idx" ON "esop_grants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_org_idx" ON "secretarial_filings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "filing_due_date_idx" ON "secretarial_filings" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_capital_org_idx" ON "share_capital" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coa_org_code_idx" ON "chart_of_accounts" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coa_org_type_idx" ON "chart_of_accounts" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coa_org_active_idx" ON "chart_of_accounts" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gstin_registry_org_gstin_idx" ON "gstin_registry" USING btree ("org_id","gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstin_registry_org_idx" ON "gstin_registry" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstr_filings_org_gstin_month_year_idx" ON "gstr_filings" USING btree ("org_id","gstin_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gstr_filings_org_status_idx" ON "gstr_filings" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "je_org_date_idx" ON "journal_entries" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "je_org_status_idx" ON "journal_entries" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "je_org_number_idx" ON "journal_entries" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "je_org_fy_period_idx" ON "journal_entries" USING btree ("org_id","financial_year","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jel_je_idx" ON "journal_entry_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jel_account_idx" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jel_org_account_idx" ON "journal_entry_lines" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfd_org_entity_idx" ON "custom_field_definitions" USING btree ("org_id","entity");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfd_org_entity_name_idx" ON "custom_field_definitions" USING btree ("org_id","entity","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfv_org_entity_record_idx" ON "custom_field_values" USING btree ("org_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfv_field_entity_idx" ON "custom_field_values" USING btree ("field_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfv_unique_field_entity_idx" ON "custom_field_values" USING btree ("field_id","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_rules_org_idx" ON "business_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_rules_org_enabled_idx" ON "business_rules" USING btree ("org_id","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cci_combination_filings_org_idx" ON "cci_combination_filings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_clause_templates_org_idx" ON "contract_clause_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_esign_events_contract_idx" ON "contract_esign_events" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "director_interest_disclosures_org_idx" ON "director_interest_disclosures" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dpdp_processing_activities_org_idx" ON "dpdp_processing_activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fema_return_records_org_idx" ON "fema_return_records" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issuer_programme_matrix_org_key_uidx" ON "issuer_programme_matrix" USING btree ("org_id","matrix_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issuer_programme_matrix_org_idx" ON "issuer_programme_matrix" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_hold_records_org_idx" ON "legal_hold_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lodor_calendar_entries_org_idx" ON "lodor_calendar_entries" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mca_filing_records_org_idx" ON "mca_filing_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msme_payment_trackers_org_idx" ON "msme_payment_trackers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "privacy_breach_profiles_org_jurisdiction_uidx" ON "privacy_breach_notification_profiles" USING btree ("org_id","jurisdiction_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "privacy_breach_profiles_org_idx" ON "privacy_breach_notification_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "related_party_transactions_org_idx" ON "related_party_transactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_read_audit_org_idx" ON "resource_read_audit_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sec_incident_ticket_links_unique" ON "sec_incident_ticket_links" USING btree ("incident_id","ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_incident_ticket_links_org_idx" ON "sec_incident_ticket_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_regulator_licences_org_idx" ON "sector_regulator_licences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shareholder_grievances_org_idx" ON "shareholder_grievances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shareholder_voting_results_org_idx" ON "shareholder_voting_results" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "statutory_register_entries_uidx" ON "statutory_register_entries" USING btree ("org_id","register_type","entry_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statutory_register_entries_org_idx" ON "statutory_register_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerability_exceptions_org_idx" ON "vulnerability_exceptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xbrl_export_jobs_org_idx" ON "xbrl_export_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_audit_request_idx" ON "signature_audit" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_audit_occurred_idx" ON "signature_audit" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_org_idx" ON "signature_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_source_idx" ON "signature_requests" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_status_idx" ON "signature_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_signers_request_idx" ON "signature_signers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_signers_email_idx" ON "signature_signers" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_acls_doc_principal_idx" ON "document_acls" USING btree ("document_id","principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_retention_org_name_idx" ON "document_retention_policies" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_versions_doc_version_idx" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_org_idx" ON "documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_source_idx" ON "documents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_sha256_idx" ON "documents" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_deleted_idx" ON "documents" USING btree ("deleted_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_configuration_item_id_ci_items_id_fk" FOREIGN KEY ("configuration_item_id") REFERENCES "public"."ci_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_known_error_id_known_errors_id_fk" FOREIGN KEY ("known_error_id") REFERENCES "public"."known_errors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_tickets_id_fk" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_initiative_id_strategic_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."strategic_initiatives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_won_approved_by_users_id_fk" FOREIGN KEY ("won_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_fulfillment_ticket_id_tickets_id_fk" FOREIGN KEY ("fulfillment_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_parent_ticket_id_idx" ON "tickets" USING btree ("parent_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ci_items_org_external_key_uidx" ON "ci_items" USING btree ("org_id","external_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_flow_idx" ON "invoices" USING btree ("org_id","invoice_flow");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_legal_entity_idx" ON "purchase_orders" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_initiative_idx" ON "projects" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_matters_next_hearing_idx" ON "legal_matters" USING btree ("org_id","next_hearing_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_requests_batch_idx" ON "catalog_requests" USING btree ("org_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_idempotency_key_idx" ON "tickets" USING btree ("org_id","idempotency_key") WHERE "tickets"."idempotency_key" IS NOT NULL;