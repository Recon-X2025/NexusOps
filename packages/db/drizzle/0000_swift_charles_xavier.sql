CREATE TYPE "public"."org_plan" AS ENUM('free', 'starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."permission_action" AS ENUM('create', 'read', 'update', 'delete', 'manage');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ticket_impact" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."ticket_relation_type" AS ENUM('blocks', 'blocked_by', 'duplicate', 'related');--> statement-breakpoint
CREATE TYPE "public"."ticket_requester_type" AS ENUM('internal', 'external');--> statement-breakpoint
CREATE TYPE "public"."ticket_status_category" AS ENUM('open', 'in_progress', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('incident', 'request', 'problem', 'change');--> statement-breakpoint
CREATE TYPE "public"."ticket_urgency" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('in_stock', 'deployed', 'maintenance', 'retired', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."ci_relation_type" AS ENUM('depends_on', 'runs_on', 'connected_to', 'member_of', 'hosts');--> statement-breakpoint
CREATE TYPE "public"."ci_status" AS ENUM('operational', 'degraded', 'down', 'planned');--> statement-breakpoint
CREATE TYPE "public"."ci_type" AS ENUM('server', 'application', 'database', 'network', 'service', 'cloud');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('per_seat', 'device', 'site', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled', 'waiting');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'waiting');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger_type" AS ENUM('ticket_created', 'ticket_updated', 'status_changed', 'scheduled', 'manual', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'weekend');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'probation', 'on_leave', 'resigned', 'terminated', 'offboarded');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contractor', 'intern');--> statement-breakpoint
CREATE TYPE "public"."hr_case_type" AS ENUM('onboarding', 'offboarding', 'leave', 'policy', 'benefits', 'workplace', 'equipment');--> statement-breakpoint
CREATE TYPE "public"."kr_status" AS ENUM('on_track', 'at_risk', 'behind', 'completed');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('vacation', 'sick', 'parental', 'bereavement', 'unpaid', 'other');--> statement-breakpoint
CREATE TYPE "public"."okr_cycle" AS ENUM('q1', 'q2', 'q3', 'q4', 'annual');--> statement-breakpoint
CREATE TYPE "public"."okr_status" AS ENUM('draft', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'under_review', 'hr_approved', 'finance_approved', 'cfo_approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."public_holiday_type" AS ENUM('national', 'restricted', 'state', 'company');--> statement-breakpoint
CREATE TYPE "public"."shift_type" AS ENUM('morning', 'afternoon', 'night', 'flexible', 'remote');--> statement-breakpoint
CREATE TYPE "public"."tax_regime" AS ENUM('old', 'new');--> statement-breakpoint
CREATE TYPE "public"."grn_status" AS ENUM('draft', 'submitted', 'quality_pending', 'accepted', 'partial_acceptance', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'confirmed', 'matched', 'exception', 'approved', 'paid', 'overdue', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('tax_invoice', 'credit_note', 'debit_note', 'proforma');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'sent', 'acknowledged', 'partially_received', 'received', 'invoiced', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pr_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'ordered', 'received', 'closed');--> statement-breakpoint
CREATE TYPE "public"."tds_section" AS ENUM('194C', '194J', '194I', 'nil');--> statement-breakpoint
CREATE TYPE "public"."kb_article_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'disconnected', 'error', 'pending');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."wo_priority" AS ENUM('1_critical', '2_high', '3_moderate', '4_low', '5_planning');--> statement-breakpoint
CREATE TYPE "public"."wo_state" AS ENUM('draft', 'open', 'pending_dispatch', 'dispatched', 'work_in_progress', 'on_hold', 'complete', 'cancelled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."wo_task_state" AS ENUM('pending_dispatch', 'open', 'accepted', 'work_in_progress', 'complete', 'cancelled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."wo_type" AS ENUM('corrective', 'preventive', 'installation', 'inspection', 'repair', 'upgrade', 'decommission');--> statement-breakpoint
CREATE TYPE "public"."change_approval_decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."change_risk" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."change_status" AS ENUM('draft', 'submitted', 'cab_review', 'approved', 'scheduled', 'implementing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('normal', 'standard', 'emergency', 'expedited');--> statement-breakpoint
CREATE TYPE "public"."problem_status" AS ENUM('new', 'investigation', 'root_cause_identified', 'known_error', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('planning', 'build', 'test', 'deploy', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sec_incident_severity" AS ENUM('critical', 'high', 'medium', 'low', 'informational');--> statement-breakpoint
CREATE TYPE "public"."sec_incident_status" AS ENUM('new', 'triage', 'containment', 'eradication', 'recovery', 'closed', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."vuln_severity" AS ENUM('critical', 'high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."vuln_status" AS ENUM('open', 'in_progress', 'remediated', 'accepted', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."audit_plan_status" AS ENUM('planned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."control_effectiveness" AS ENUM('effective', 'partially_effective', 'ineffective', 'not_tested');--> statement-breakpoint
CREATE TYPE "public"."control_type" AS ENUM('preventive', 'detective', 'corrective', 'directive');--> statement-breakpoint
CREATE TYPE "public"."finding_remediation_status" AS ENUM('open', 'in_progress', 'completed', 'overdue', 'risk_accepted');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('critical', 'high', 'medium', 'low', 'informational');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('draft', 'review', 'approved', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_status" AS ENUM('not_sent', 'pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."risk_category" AS ENUM('operational', 'financial', 'strategic', 'compliance', 'technology', 'reputational', 'hr');--> statement-breakpoint
CREATE TYPE "public"."risk_rating" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('identified', 'assessed', 'mitigating', 'accepted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."risk_treatment" AS ENUM('accept', 'mitigate', 'transfer', 'avoid');--> statement-breakpoint
CREATE TYPE "public"."vendor_tier" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'under_review', 'legal_review', 'awaiting_signature', 'active', 'expiring_soon', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('nda', 'msa', 'sow', 'license', 'customer_agreement', 'sla_support', 'colocation', 'employment', 'vendor', 'partnership');--> statement-breakpoint
CREATE TYPE "public"."obligation_frequency" AS ENUM('one_time', 'monthly', 'quarterly', 'annually', 'ongoing');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('pending', 'compliant', 'overdue', 'completed');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('upcoming', 'in_progress', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."project_health" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('proposed', 'planning', 'active', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'in_review', 'done');--> statement-breakpoint
CREATE TYPE "public"."account_tier" AS ENUM('enterprise', 'mid_market', 'smb');--> statement-breakpoint
CREATE TYPE "public"."crm_activity_type" AS ENUM('call', 'email', 'meeting', 'demo', 'follow_up', 'note');--> statement-breakpoint
CREATE TYPE "public"."contact_seniority" AS ENUM('c_level', 'vp', 'director', 'manager', 'individual_contributor');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('prospect', 'qualification', 'proposal', 'negotiation', 'verbal_commit', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('website', 'referral', 'event', 'cold_outreach', 'partner', 'advertising', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."investigation_status" AS ENUM('reported', 'under_investigation', 'findings', 'closed');--> statement-breakpoint
CREATE TYPE "public"."investigation_type" AS ENUM('ethics', 'harassment', 'fraud', 'data_breach', 'whistleblower', 'discrimination');--> statement-breakpoint
CREATE TYPE "public"."legal_matter_status" AS ENUM('intake', 'active', 'discovery', 'pre_trial', 'trial', 'closed', 'settled');--> statement-breakpoint
CREATE TYPE "public"."legal_matter_type" AS ENUM('litigation', 'employment', 'ip', 'regulatory', 'ma', 'data_privacy', 'corporate', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."legal_request_status" AS ENUM('new', 'assigned', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."building_status" AS ENUM('active', 'maintenance', 'closed');--> statement-breakpoint
CREATE TYPE "public"."facility_request_status" AS ENUM('new', 'assigned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."facility_request_type" AS ENUM('maintenance', 'cleaning', 'catering', 'parking', 'access', 'other');--> statement-breakpoint
CREATE TYPE "public"."move_request_status" AS ENUM('requested', 'approved', 'scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deployment_env" AS ENUM('dev', 'qa', 'staging', 'uat', 'production');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'in_progress', 'success', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('running', 'success', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."survey_type" AS ENUM('csat', 'nps', 'employee_pulse', 'post_incident', 'onboarding', 'exit_interview', 'training', 'vendor_review');--> statement-breakpoint
CREATE TYPE "public"."approval_step_status" AS ENUM('pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'slack');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'warning', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."app_lifecycle" AS ENUM('evaluating', 'investing', 'sustaining', 'harvesting', 'retiring', 'obsolete');--> statement-breakpoint
CREATE TYPE "public"."cloud_readiness" AS ENUM('cloud_native', 'lift_shift', 'replatform', 'rearchitect', 'retire', 'not_assessed');--> statement-breakpoint
CREATE TYPE "public"."rotation_type" AS ENUM('daily', 'weekly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('travel', 'accommodation', 'food', 'meals', 'fuel', 'transport', 'communication', 'office_supplies', 'software', 'marketing', 'client_entertainment', 'training', 'entertainment', 'medical', 'miscellaneous', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'reimbursed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('draft', 'active', 'at_risk', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rating_scale" AS ENUM('1', '2', '3', '4', '5');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'self_review', 'peer_review', 'manager_review', 'calibration', 'completed');--> statement-breakpoint
CREATE TYPE "public"."catalog_item_status" AS ENUM('active', 'inactive', 'retired');--> statement-breakpoint
CREATE TYPE "public"."catalog_request_status" AS ENUM('submitted', 'pending_approval', 'approved', 'fulfilling', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."compliance_item_status" AS ENUM('upcoming', 'due_soon', 'overdue', 'filed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."compliance_type" AS ENUM('annual', 'event_based', 'monthly', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."din_kyc_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."director_type" AS ENUM('executive', 'non_executive', 'independent', 'nominee');--> statement-breakpoint
CREATE TYPE "public"."ecr_submission_status" AS ENUM('generated', 'submitted', 'acknowledged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."mfa_type" AS ENUM('otp_email', 'otp_sms', 'totp_app');--> statement-breakpoint
CREATE TYPE "public"."portal_user_role" AS ENUM('primary_contact', 'secondary_contact', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."portal_user_status" AS ENUM('pending_approval', 'active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."tds_form_type" AS ENUM('24Q', '26Q', '27Q', '27EQ');--> statement-breakpoint
CREATE TYPE "public"."candidate_source" AS ENUM('linkedin', 'naukri', 'indeed', 'referral', 'agency', 'website', 'campus', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_stage" AS ENUM('applied', 'screening', 'phone_screen', 'technical', 'panel', 'hr_round', 'offer', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('phone', 'video', 'onsite', 'technical', 'case_study', 'hr');--> statement-breakpoint
CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'open', 'on_hold', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'freelance');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."esop_event" AS ENUM('grant', 'vest', 'exercise', 'lapse', 'cancel');--> statement-breakpoint
CREATE TYPE "public"."secretarial_filing_status" AS ENUM('upcoming', 'in_progress', 'filed', 'overdue', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."board_meeting_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'adjourned');--> statement-breakpoint
CREATE TYPE "public"."board_meeting_type" AS ENUM('board', 'audit_committee', 'nomination_committee', 'compensation_committee', 'agm', 'egm', 'creditors');--> statement-breakpoint
CREATE TYPE "public"."board_resolution_status" AS ENUM('draft', 'passed', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."board_resolution_type" AS ENUM('ordinary', 'special', 'board', 'circular');--> statement-breakpoint
CREATE TYPE "public"."share_class" AS ENUM('equity', 'preference', 'esop_pool', 'convertible');--> statement-breakpoint
CREATE TYPE "public"."account_sub_type" AS ENUM('bank', 'cash', 'accounts_receivable', 'other_current_asset', 'fixed_asset', 'accumulated_depreciation', 'other_asset', 'accounts_payable', 'credit_card', 'other_current_liability', 'long_term_liability', 'owners_equity', 'retained_earnings', 'share_capital', 'income', 'other_income', 'cost_of_goods_sold', 'expense', 'other_expense', 'payroll_expense', 'depreciation');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense', 'contra_asset', 'contra_liability', 'contra_equity', 'contra_income', 'contra_expense');--> statement-breakpoint
CREATE TYPE "public"."gstr_filing_status" AS ENUM('draft', 'ready', 'filed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_type" AS ENUM('manual', 'invoice', 'payment', 'payroll', 'depreciation', 'closing', 'opening', 'reversal', 'gst_liability', 'tds_deduction');--> statement-breakpoint
CREATE TYPE "public"."custom_field_entity" AS ENUM('ticket', 'asset', 'employee', 'contract', 'vendor', 'project', 'change_request', 'lead', 'invoice', 'expense_claim', 'okr_objective');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'textarea', 'number', 'decimal', 'boolean', 'date', 'datetime', 'select', 'multi_select', 'url', 'email', 'phone', 'user_reference', 'file', 'json');--> statement-breakpoint
CREATE TYPE "public"."esign_provider" AS ENUM('emudhra', 'docusign', 'internal_otp');--> statement-breakpoint
CREATE TYPE "public"."esign_request_status" AS ENUM('draft', 'sent', 'viewed', 'signed', 'declined', 'expired', 'voided', 'completed');--> statement-breakpoint
CREATE TYPE "public"."esigner_status" AS ENUM('pending', 'viewed', 'signed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."document_acl_permission" AS ENUM('read', 'write', 'delete', 'share');--> statement-breakpoint
CREATE TYPE "public"."document_acl_principal_type" AS ENUM('user', 'role', 'team', 'everyone_in_org');--> statement-breakpoint
CREATE TYPE "public"."document_classification" AS ENUM('public', 'internal', 'confidential', 'restricted', 'pii');--> statement-breakpoint
CREATE TYPE "public"."document_scan_status" AS ENUM('pending', 'clean', 'infected', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_counters" (
	"org_id" text NOT NULL,
	"entity" text NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "org_counters_org_id_entity_pk" PRIMARY KEY("org_id","entity")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "org_plan" DEFAULT 'free' NOT NULL,
	"settings" jsonb,
	"logo_url" text,
	"primary_color" text DEFAULT '#6366f1',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource" text NOT NULL,
	"action" "permission_action" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"matrix_role" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"type" text DEFAULT 'magic_link' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_time_minutes" integer,
	"resolve_time_minutes" integer,
	"escalation_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1',
	"icon" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachments" jsonb,
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
CREATE TABLE IF NOT EXISTS "ticket_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"sla_response_minutes" integer,
	"sla_resolve_minutes" integer,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" "ticket_relation_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"category" "ticket_status_category" DEFAULT 'open' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_watchers" (
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"priority_id" uuid,
	"status_id" uuid NOT NULL,
	"type" "ticket_type" DEFAULT 'request' NOT NULL,
	"impact" "ticket_impact" DEFAULT 'medium' NOT NULL,
	"urgency" "ticket_urgency" DEFAULT 'medium' NOT NULL,
	"subcategory" text,
	"requester_id" uuid NOT NULL,
	"requester_type" "ticket_requester_type" DEFAULT 'internal' NOT NULL,
	"assignee_id" uuid,
	"team_id" uuid,
	"configuration_item_id" uuid,
	"known_error_id" uuid,
	"is_major_incident" boolean DEFAULT false NOT NULL,
	"required_skill" text,
	"sla_pause_reason_code" text,
	"parent_ticket_id" uuid,
	"intake_channel" text DEFAULT 'portal' NOT NULL,
	"resolution_notes" text,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"sla_response_due_at" timestamp with time zone,
	"sla_resolve_due_at" timestamp with time zone,
	"sla_responded_at" timestamp with time zone,
	"sla_paused_at" timestamp with time zone,
	"sla_pause_duration_mins" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"custom_fields" jsonb,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"search_vector" text,
	"embedding_vector" text,
	"external_id" text,
	"external_source" text,
	"idempotency_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"match_value" text,
	"team_id" uuid NOT NULL,
	"algorithm" text DEFAULT 'load_based' NOT NULL,
	"capacity_threshold" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_assignment_stats" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"last_assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"fields_schema" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_tag" text NOT NULL,
	"name" text NOT NULL,
	"type_id" uuid NOT NULL,
	"status" "asset_status" DEFAULT 'in_stock' NOT NULL,
	"owner_id" uuid,
	"location" text,
	"purchase_date" timestamp with time zone,
	"purchase_cost" numeric(12, 2),
	"warranty_expiry" timestamp with time zone,
	"vendor" text,
	"custom_fields" jsonb,
	"parent_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ci_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"external_key" text,
	"ci_type" "ci_type" NOT NULL,
	"status" "ci_status" DEFAULT 'operational' NOT NULL,
	"environment" text,
	"attributes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ci_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relation_type" "ci_relation_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "license_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"asset_id" uuid,
	"user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "software_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"type" "license_type" NOT NULL,
	"total_seats" numeric(10, 0),
	"cost" numeric(12, 2),
	"purchase_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"temporal_workflow_id" text,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"trigger_data" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "workflow_step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" "workflow_trigger_type" NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"department" text,
	"title" text,
	"job_grade" text,
	"manager_id" uuid,
	"dotted_line_manager_id" uuid,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"location" text,
	"city" text,
	"state" text,
	"is_metro_city" boolean DEFAULT false NOT NULL,
	"pan" text,
	"aadhaar" text,
	"uan" text,
	"bank_account_number" text,
	"bank_ifsc" text,
	"bank_name" text,
	"tax_regime" "tax_regime" DEFAULT 'new' NOT NULL,
	"salary_structure_id" uuid,
	"start_date" timestamp with time zone,
	"confirmation_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
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
	"merchant" text,
	"mileage_km" numeric(10, 2),
	"policy_violation_code" text,
	"policy_violation_reason" text,
	"ocr_extracted" jsonb,
	"ocr_confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_case_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_type" "hr_case_type" NOT NULL,
	"employee_id" uuid NOT NULL,
	"status_id" uuid,
	"assignee_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"year" integer NOT NULL,
	"total_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"used_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"pending_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
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
CREATE TABLE IF NOT EXISTS "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"pipeline_status" text DEFAULT 'DRAFT' NOT NULL,
	"run_number" integer DEFAULT 1 NOT NULL,
	"workflow_metadata" jsonb DEFAULT '{"errors":[],"approvals":[]}'::jsonb NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_pf_employee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_pf_employer" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_pt" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_tds" numeric(12, 2) DEFAULT '0' NOT NULL,
	"approved_by_hr_id" uuid,
	"approved_by_finance_id" uuid,
	"approved_by_cfo_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"basic" numeric(12, 2) DEFAULT '0' NOT NULL,
	"hra" numeric(12, 2) DEFAULT '0' NOT NULL,
	"special_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"conveyance_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gross_earnings" numeric(12, 2) DEFAULT '0' NOT NULL,
	"pf_employee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"pf_employer" numeric(12, 2) DEFAULT '0' NOT NULL,
	"professional_tax" numeric(10, 2) DEFAULT '0' NOT NULL,
	"lwf" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tds" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"ytd_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ytd_tds" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_regime_used" "tax_regime" DEFAULT 'new' NOT NULL,
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"structure_name" text NOT NULL,
	"ctc_annual" numeric(14, 2) NOT NULL,
	"basic_percent" numeric(5, 2) DEFAULT '40' NOT NULL,
	"hra_percent_of_basic" numeric(5, 2) DEFAULT '50' NOT NULL,
	"lta_annual" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_allowance_annual" numeric(12, 2) DEFAULT '15000' NOT NULL,
	"conveyance_allowance_annual" numeric(12, 2) DEFAULT '19200' NOT NULL,
	"bonus_annual" numeric(12, 2) DEFAULT '0' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"requester_id" uuid,
	"title" text,
	"description" text,
	"type" text DEFAULT 'change',
	"priority" text DEFAULT 'normal',
	"due_date" timestamp with time zone,
	"amount" text,
	"request_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone,
	"idempotency_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goods_receipt_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grn_number" text NOT NULL,
	"po_id" uuid NOT NULL,
	"received_by_id" uuid,
	"vendor_delivery_challan" text,
	"status" "grn_status" DEFAULT 'draft' NOT NULL,
	"shortage_noted" boolean DEFAULT false NOT NULL,
	"damage_noted" boolean DEFAULT false NOT NULL,
	"damage_description" text,
	"grn_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grn_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"po_line_item_id" uuid,
	"item_code" text,
	"ordered_quantity" integer DEFAULT 0 NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"accepted_quantity" integer DEFAULT 0 NOT NULL,
	"rejected_quantity" integer DEFAULT 0 NOT NULL,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_item_number" integer NOT NULL,
	"description" text NOT NULL,
	"hsn_sac_code" text,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_flow" text DEFAULT 'payable' NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'tax_invoice' NOT NULL,
	"vendor_id" uuid NOT NULL,
	"legal_entity_id" uuid,
	"po_id" uuid,
	"grn_id" uuid,
	"supplier_gstin" text,
	"buyer_gstin" text,
	"place_of_supply" text,
	"is_interstate" boolean DEFAULT false NOT NULL,
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"taxable_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tds_deducted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"matching_status" text DEFAULT 'pending' NOT NULL,
	"e_invoice_irn" text,
	"e_invoice_ack_number" text,
	"e_invoice_ack_date" timestamp with time zone,
	"e_invoice_signed_qr_code" text,
	"e_invoice_status" text,
	"e_invoice_last_attempt_at" timestamp with time zone,
	"e_invoice_error" text,
	"eway_bill_number" text,
	"original_invoice_number" text,
	"invoice_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"approved_by_id" uuid,
	"payment_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "po_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"description" text NOT NULL,
	"hsn_sac_code" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"accepted_quantity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"pr_id" uuid,
	"vendor_id" uuid NOT NULL,
	"vendor_gstin" text,
	"delivery_address" text,
	"taxable_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "po_status" DEFAULT 'draft' NOT NULL,
	"expected_delivery" timestamp with time zone,
	"notes" text,
	"legal_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"description" text NOT NULL,
	"hsn_sac_code" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"vendor_id" uuid,
	"asset_type_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"requester_id" uuid NOT NULL,
	"title" text NOT NULL,
	"justification" text,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "pr_status" DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"department" text,
	"budget_code" text,
	"current_approver_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor_type" text DEFAULT 'goods_supplier' NOT NULL,
	"gstin" text,
	"pan" text,
	"tds_section" "tds_section" DEFAULT 'nil' NOT NULL,
	"tds_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"is_msme" boolean DEFAULT false NOT NULL,
	"msme_udyam_number" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_person_name" text,
	"address" text,
	"state" text,
	"payment_terms" text,
	"status" text DEFAULT 'active' NOT NULL,
	"blacklist_reason" text,
	"rating" numeric(3, 1),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "kb_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" "kb_article_status" DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"not_helpful_count" integer DEFAULT 0 NOT NULL,
	"author_id" uuid NOT NULL,
	"embedding_vector" text,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "request_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_priority_id" uuid,
	"default_assignee_id" uuid,
	"workflow_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"entity_type" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"config_encrypted" text,
	"kms_key_id" text,
	"dek_wrapped_b64" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response" text,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"part_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'spare' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"min_qty" integer DEFAULT 5 NOT NULL,
	"location" text,
	"unit_cost" numeric(12, 2),
	"supplier_id" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"reference" text,
	"notes" text,
	"performed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_order_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"note" text,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_order_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"short_description" text NOT NULL,
	"state" "wo_task_state" DEFAULT 'pending_dispatch' NOT NULL,
	"assigned_to_id" uuid,
	"planned_start_date" timestamp with time zone,
	"planned_end_date" timestamp with time zone,
	"actual_start_date" timestamp with time zone,
	"actual_end_date" timestamp with time zone,
	"estimated_hours" integer,
	"actual_hours" integer,
	"work_notes" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"short_description" text NOT NULL,
	"description" text,
	"state" "wo_state" DEFAULT 'open' NOT NULL,
	"type" "wo_type" DEFAULT 'corrective' NOT NULL,
	"priority" "wo_priority" DEFAULT '4_low' NOT NULL,
	"assigned_to_id" uuid,
	"requested_by_id" uuid,
	"location" text,
	"category" text,
	"subcategory" text,
	"cmdb_ci" text,
	"scheduled_start_date" timestamp with time zone,
	"scheduled_end_date" timestamp with time zone,
	"actual_start_date" timestamp with time zone,
	"actual_end_date" timestamp with time zone,
	"estimated_hours" integer,
	"actual_hours" integer,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"work_notes" text,
	"close_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"decision" "change_approval_decision" DEFAULT 'pending' NOT NULL,
	"comments" text,
	"decided_at" timestamp with time zone,
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
CREATE TABLE IF NOT EXISTS "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "change_type" DEFAULT 'normal' NOT NULL,
	"risk" "change_risk" DEFAULT 'medium' NOT NULL,
	"status" "change_status" DEFAULT 'draft' NOT NULL,
	"requester_id" uuid NOT NULL,
	"assignee_id" uuid,
	"cab_decision" text,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"rollback_plan" text,
	"implementation_plan" text,
	"test_plan" text,
	"affected_cis" jsonb DEFAULT '[]'::jsonb,
	"risk_score" integer,
	"risk_questionnaire" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "known_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"problem_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"workaround" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "problem_status" DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"root_cause" text,
	"workaround" text,
	"resolution" text,
	"notes" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"status" "release_status" DEFAULT 'planning' NOT NULL,
	"planned_date" timestamp with time zone,
	"actual_date" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "sec_incident_severity" DEFAULT 'medium' NOT NULL,
	"status" "sec_incident_status" DEFAULT 'new' NOT NULL,
	"assignee_id" uuid,
	"reporter_id" uuid,
	"attack_vector" text,
	"mitre_techniques" jsonb DEFAULT '[]'::jsonb,
	"iocs" jsonb DEFAULT '[]'::jsonb,
	"containment_actions" jsonb DEFAULT '[]'::jsonb,
	"affected_systems" jsonb DEFAULT '[]'::jsonb,
	"timeline" jsonb DEFAULT '[]'::jsonb,
	"ir_playbook_checklist" jsonb DEFAULT '[]'::jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vulnerabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cve_id" text,
	"title" text NOT NULL,
	"description" text,
	"cvss_score" numeric(3, 1),
	"severity" "vuln_severity" DEFAULT 'medium' NOT NULL,
	"status" "vuln_status" DEFAULT 'open' NOT NULL,
	"affected_assets" jsonb DEFAULT '[]'::jsonb,
	"remediation" text,
	"assignee_id" uuid,
	"discovered_at" timestamp with time zone,
	"remediated_at" timestamp with time zone,
	"external_fingerprint" text,
	"scanner_source" text,
	"remediation_sla_days" integer,
	"remediation_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"audit_plan_id" uuid NOT NULL,
	"finding_number" text NOT NULL,
	"title" text NOT NULL,
	"finding_severity" "finding_severity" DEFAULT 'medium' NOT NULL,
	"criteria" text NOT NULL,
	"condition" text NOT NULL,
	"cause" text NOT NULL,
	"effect" text NOT NULL,
	"recommendation" text,
	"management_response" text,
	"agreed_action" text,
	"action_owner_id" uuid,
	"remediation_status" "finding_remediation_status" DEFAULT 'open' NOT NULL,
	"target_remediation_date" timestamp with time zone,
	"actual_remediation_date" timestamp with time zone,
	"linked_risk_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"status" "audit_plan_status" DEFAULT 'planned' NOT NULL,
	"auditor_id" uuid,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"category" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"owner_id" uuid,
	"review_cycle_months" integer DEFAULT 12,
	"last_reviewed" timestamp with time zone,
	"next_review" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "risk_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"control_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"control_type" "control_type" DEFAULT 'preventive' NOT NULL,
	"control_category" text DEFAULT 'manual' NOT NULL,
	"control_frequency" text DEFAULT 'monthly' NOT NULL,
	"control_owner_id" uuid,
	"mapped_risk_ids" text[] DEFAULT '{}' NOT NULL,
	"effectiveness_rating" "control_effectiveness" DEFAULT 'not_tested' NOT NULL,
	"last_tested_date" timestamp with time zone,
	"next_test_date" timestamp with time zone,
	"last_evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "risk_category" DEFAULT 'operational' NOT NULL,
	"likelihood" integer DEFAULT 3 NOT NULL,
	"impact" integer DEFAULT 3 NOT NULL,
	"risk_score" integer DEFAULT 9 NOT NULL,
	"risk_rating" "risk_rating" DEFAULT 'medium' NOT NULL,
	"status" "risk_status" DEFAULT 'identified' NOT NULL,
	"treatment" "risk_treatment",
	"owner_id" uuid,
	"review_date" timestamp with time zone,
	"review_frequency" text DEFAULT 'quarterly' NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"controls" jsonb DEFAULT '[]'::jsonb,
	"mitigation_plan" text,
	"residual_likelihood" integer,
	"residual_impact" integer,
	"residual_risk_score" integer,
	"residual_risk_rating" "risk_rating",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"tier" "vendor_tier" DEFAULT 'medium' NOT NULL,
	"risk_score" integer DEFAULT 0,
	"questionnaire_status" "questionnaire_status" DEFAULT 'not_sent' NOT NULL,
	"last_assessed" timestamp with time zone,
	"next_assessment" timestamp with time zone,
	"findings" jsonb,
	"attachment_refs" jsonb DEFAULT '[]'::jsonb,
	"questionnaire_answers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"department" text,
	"fiscal_year" integer NOT NULL,
	"budgeted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"committed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual" numeric(14, 2) DEFAULT '0' NOT NULL,
	"forecast" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chargebacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"department" text NOT NULL,
	"service" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"period_month" integer NOT NULL,
	"period_year" integer NOT NULL,
	"allocation_method" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"party" text,
	"frequency" "obligation_frequency" DEFAULT 'one_time' NOT NULL,
	"status" "obligation_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_number" text NOT NULL,
	"title" text NOT NULL,
	"counterparty" text NOT NULL,
	"type" "contract_type" DEFAULT 'vendor' NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"value" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"notice_period_days" integer DEFAULT 30,
	"governing_law" text,
	"internal_owner_id" uuid,
	"legal_owner_id" uuid,
	"clauses" jsonb DEFAULT '[]'::jsonb,
	"amendments" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"execution_date" timestamp with time zone,
	"stamp_duty_status" text,
	"registration_status" text,
	"registration_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"status" "milestone_status" DEFAULT 'upcoming' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"story_points" integer,
	"sprint" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"phase" text,
	"health" "project_health" DEFAULT 'green' NOT NULL,
	"budget_total" numeric(14, 2),
	"budget_spent" numeric(14, 2) DEFAULT '0',
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"owner_id" uuid,
	"department" text,
	"tags" text[] DEFAULT '{}',
	"initiative_id" uuid,
	"benefit_type" text,
	"benefit_target" numeric(14, 2),
	"benefit_actual" numeric(14, 2),
	"linked_application_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "crm_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"tier" "account_tier" DEFAULT 'smb' NOT NULL,
	"health_score" integer DEFAULT 70,
	"annual_revenue" numeric(16, 2),
	"website" text,
	"billing_address" text,
	"credit_limit" numeric(14, 2),
	"owner_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "crm_activity_type" DEFAULT 'note' NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"deal_id" uuid,
	"contact_id" uuid,
	"account_id" uuid,
	"owner_id" uuid,
	"outcome" text,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"seniority" "contact_seniority",
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"account_id" uuid,
	"contact_id" uuid,
	"stage" "deal_stage" DEFAULT 'prospect' NOT NULL,
	"value" numeric(14, 2),
	"probability" integer DEFAULT 10 NOT NULL,
	"weighted_value" numeric(14, 2),
	"expected_close" timestamp with time zone,
	"owner_id" uuid,
	"lost_reason" text,
	"closed_at" timestamp with time zone,
	"won_approved_at" timestamp with time zone,
	"won_approved_by" uuid,
	"won_approval_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"company" text,
	"source" "lead_source" DEFAULT 'website' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"owner_id" uuid,
	"converted_deal_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"deal_id" uuid,
	"quote_number" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"valid_until" timestamp with time zone,
	"items" jsonb DEFAULT '[]'::jsonb,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0',
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "investigation_type" DEFAULT 'ethics' NOT NULL,
	"status" "investigation_status" DEFAULT 'reported' NOT NULL,
	"confidential" boolean DEFAULT true NOT NULL,
	"anonymous_report" boolean DEFAULT false NOT NULL,
	"investigator_id" uuid,
	"findings" text,
	"recommendation" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"matter_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "legal_matter_type" DEFAULT 'commercial' NOT NULL,
	"status" "legal_matter_status" DEFAULT 'intake' NOT NULL,
	"phase" text,
	"confidential" boolean DEFAULT false NOT NULL,
	"estimated_cost" numeric(14, 2),
	"actual_cost" numeric(14, 2),
	"assigned_to" uuid,
	"external_counsel" text,
	"jurisdiction" text,
	"cnr" text,
	"court_name" text,
	"forum" text,
	"next_hearing_at" timestamp with time zone,
	"limitation_deadline_at" timestamp with time zone,
	"arbitration_seat" text,
	"arbitration_institution" text,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "legal_request_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"linked_matter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"floors" integer DEFAULT 1,
	"capacity" integer,
	"status" "building_status" DEFAULT 'active' NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facility_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"type" "facility_request_type" DEFAULT 'maintenance' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" "facility_request_status" DEFAULT 'new' NOT NULL,
	"assignee_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "move_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"from_location" text,
	"to_location" text NOT NULL,
	"status" "move_request_status" DEFAULT 'requested' NOT NULL,
	"move_date" timestamp with time zone,
	"approved_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"booked_by_id" uuid NOT NULL,
	"title" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"attendee_count" integer,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"name" text NOT NULL,
	"floor" integer DEFAULT 1,
	"capacity" integer,
	"equipment" jsonb DEFAULT '[]'::jsonb,
	"bookable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_run_id" uuid,
	"app_name" text NOT NULL,
	"environment" "deployment_env" DEFAULT 'dev' NOT NULL,
	"version" text NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"deployed_by_id" uuid,
	"change_id" uuid,
	"duration_seconds" integer,
	"rollback_version" text,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pipeline_name" text NOT NULL,
	"trigger" text,
	"branch" text,
	"commit_sha" text,
	"status" "pipeline_status" DEFAULT 'running' NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb,
	"duration_seconds" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"ticket_id" uuid,
	"requester_id" uuid,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"respondent_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(5, 2),
	"comments" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "survey_type" DEFAULT 'csat' NOT NULL,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb,
	"trigger_event" text,
	"created_by_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" uuid,
	"helpful" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"status" "approval_step_status" DEFAULT 'pending' NOT NULL,
	"comments" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"event_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"type" "notification_type" DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"lifecycle" "app_lifecycle" DEFAULT 'sustaining' NOT NULL,
	"health_score" integer DEFAULT 70,
	"annual_cost" numeric(14, 2),
	"users_count" integer DEFAULT 0,
	"cloud_readiness" "cloud_readiness" DEFAULT 'not_assessed' NOT NULL,
	"tech_debt_score" integer DEFAULT 0,
	"owner_id" uuid,
	"department" text,
	"vendor" text,
	"version" text,
	"last_review_date" timestamp with time zone,
	"retirement_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oncall_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oncall_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"team" text,
	"rotation_type" "rotation_type" DEFAULT 'weekly' NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb,
	"overrides" jsonb DEFAULT '[]'::jsonb,
	"escalation_chain" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"icon" text,
	"price" numeric(10, 2),
	"approval_required" boolean DEFAULT false NOT NULL,
	"form_fields" jsonb DEFAULT '[]'::jsonb,
	"fulfillment_group" text,
	"sla_days" integer DEFAULT 3,
	"status" "catalog_item_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"form_data" jsonb DEFAULT '{}'::jsonb,
	"status" "catalog_request_status" DEFAULT 'submitted' NOT NULL,
	"fulfiller_id" uuid,
	"approval_id" uuid,
	"notes" text,
	"fulfillment_ticket_id" uuid,
	"batch_id" uuid,
	"fulfillment_checklist" jsonb DEFAULT '[]'::jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_calendar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"compliance_type" "compliance_type" DEFAULT 'annual' NOT NULL,
	"event_name" text NOT NULL,
	"mca_form" text,
	"financial_year" text,
	"due_date" timestamp with time zone NOT NULL,
	"status" "compliance_item_status" DEFAULT 'upcoming' NOT NULL,
	"reminder_days_before" integer[] DEFAULT '{30,15,7,1}' NOT NULL,
	"filed_date" timestamp with time zone,
	"srn" text,
	"ack_document_url" text,
	"penalty_per_day_inr" numeric(10, 2) DEFAULT '0' NOT NULL,
	"days_overdue" integer DEFAULT 0 NOT NULL,
	"total_penalty_inr" numeric(12, 2) DEFAULT '0' NOT NULL,
	"assigned_to_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "directors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"din" text NOT NULL,
	"full_name" text NOT NULL,
	"pan" text,
	"aadhaar" text,
	"date_of_birth" timestamp with time zone,
	"nationality" text DEFAULT 'Indian' NOT NULL,
	"residential_status" text DEFAULT 'resident' NOT NULL,
	"residential_address" text,
	"director_type" "director_type" DEFAULT 'executive' NOT NULL,
	"date_of_appointment" timestamp with time zone,
	"date_of_cessation" timestamp with time zone,
	"din_kyc_status" "din_kyc_status" DEFAULT 'active' NOT NULL,
	"din_kyc_last_completed" timestamp with time zone,
	"dsc_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "epfo_ecr_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"ecr_file_url" text,
	"submission_status" "ecr_submission_status" DEFAULT 'generated' NOT NULL,
	"epfo_ack_number" text,
	"total_employee_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_employer_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_eps_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_epf_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"portal_user_id" uuid,
	"customer_id" uuid,
	"action" text NOT NULL,
	"endpoint" text,
	"http_method" text,
	"ip_address" text,
	"user_agent" text,
	"response_status_code" integer,
	"metadata" jsonb,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"portal_user_id" text NOT NULL,
	"customer_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"password_version" integer DEFAULT 1 NOT NULL,
	"password_changed_at" timestamp with time zone,
	"role" "portal_user_role" DEFAULT 'primary_contact' NOT NULL,
	"status" "portal_user_status" DEFAULT 'pending_approval' NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"is_phone_verified" boolean DEFAULT false NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_type" "mfa_type",
	"totp_secret" text,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_reason" text,
	"is_self_registered" boolean DEFAULT false NOT NULL,
	"created_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tds_challan_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tds_section" text NOT NULL,
	"form_type" "tds_form_type" DEFAULT '24Q' NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"total_tds_deducted" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_tds_deposited" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bsr_code" text,
	"challan_serial_number" text,
	"payment_date" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"model" text NOT NULL,
	"summary" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_name" text,
	"tool_args" jsonb,
	"tool_result_preview" text,
	"sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_activity_logs" ADD CONSTRAINT "ticket_activity_logs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_activity_logs" ADD CONSTRAINT "ticket_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "ticket_priorities" ADD CONSTRAINT "ticket_priorities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_source_id_tickets_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_target_id_tickets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
 ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignment_stats" ADD CONSTRAINT "user_assignment_stats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_assignment_stats" ADD CONSTRAINT "user_assignment_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_type_id_asset_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."asset_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ci_items" ADD CONSTRAINT "ci_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ci_relationships" ADD CONSTRAINT "ci_relationships_source_id_ci_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ci_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ci_relationships" ADD CONSTRAINT "ci_relationships_target_id_ci_items_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."ci_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_license_id_software_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."software_licenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "software_licenses" ADD CONSTRAINT "software_licenses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_structure_id_salary_structures_id_fk" FOREIGN KEY ("salary_structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "hr_case_tasks" ADD CONSTRAINT "hr_case_tasks_case_id_hr_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."hr_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_case_tasks" ADD CONSTRAINT "hr_case_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_hr_id_users_id_fk" FOREIGN KEY ("approved_by_hr_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_finance_id_users_id_fk" FOREIGN KEY ("approved_by_finance_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_cfo_id_users_id_fk" FOREIGN KEY ("approved_by_cfo_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_chains" ADD CONSTRAINT "approval_chains_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_po_line_item_id_po_line_items_id_fk" FOREIGN KEY ("po_line_item_id") REFERENCES "public"."po_line_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_pr_id_purchase_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_pr_id_purchase_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "public"."asset_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_current_approver_id_users_id_fk" FOREIGN KEY ("current_approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_templates" ADD CONSTRAINT "request_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_templates" ADD CONSTRAINT "request_templates_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_templates" ADD CONSTRAINT "request_templates_default_assignee_id_users_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_activity_logs" ADD CONSTRAINT "work_order_activity_logs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_activity_logs" ADD CONSTRAINT "work_order_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_change_id_change_requests_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_errors" ADD CONSTRAINT "known_errors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_errors" ADD CONSTRAINT "known_errors_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "releases" ADD CONSTRAINT "releases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_plan_id_audit_plans_id_fk" FOREIGN KEY ("audit_plan_id") REFERENCES "public"."audit_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_action_owner_id_users_id_fk" FOREIGN KEY ("action_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_linked_risk_id_risks_id_fk" FOREIGN KEY ("linked_risk_id") REFERENCES "public"."risks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_auditor_id_users_id_fk" FOREIGN KEY ("auditor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_control_owner_id_users_id_fk" FOREIGN KEY ("control_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risks" ADD CONSTRAINT "risks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_risks" ADD CONSTRAINT "vendor_risks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_obligations" ADD CONSTRAINT "contract_obligations_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_internal_owner_id_users_id_fk" FOREIGN KEY ("internal_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legal_owner_id_users_id_fk" FOREIGN KEY ("legal_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_converted_deal_id_crm_deals_id_fk" FOREIGN KEY ("converted_deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investigations" ADD CONSTRAINT "investigations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "investigations" ADD CONSTRAINT "investigations_investigator_id_users_id_fk" FOREIGN KEY ("investigator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_matters" ADD CONSTRAINT "legal_matters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_matters" ADD CONSTRAINT "legal_matters_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_requests" ADD CONSTRAINT "legal_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_requests" ADD CONSTRAINT "legal_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_requests" ADD CONSTRAINT "legal_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_requests" ADD CONSTRAINT "legal_requests_linked_matter_id_legal_matters_id_fk" FOREIGN KEY ("linked_matter_id") REFERENCES "public"."legal_matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buildings" ADD CONSTRAINT "buildings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_requests" ADD CONSTRAINT "facility_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_requests" ADD CONSTRAINT "facility_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_requests" ADD CONSTRAINT "facility_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_booked_by_id_users_id_fk" FOREIGN KEY ("booked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_deployed_by_id_users_id_fk" FOREIGN KEY ("deployed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_respondent_id_users_id_fk" FOREIGN KEY ("respondent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_feedback" ADD CONSTRAINT "kb_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_overrides" ADD CONSTRAINT "oncall_overrides_schedule_id_oncall_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."oncall_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_overrides" ADD CONSTRAINT "oncall_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_schedules" ADD CONSTRAINT "oncall_schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_fulfiller_id_users_id_fk" FOREIGN KEY ("fulfiller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "compliance_calendar_items" ADD CONSTRAINT "compliance_calendar_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_calendar_items" ADD CONSTRAINT "compliance_calendar_items_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "directors" ADD CONSTRAINT "directors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "epfo_ecr_submissions" ADD CONSTRAINT "epfo_ecr_submissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_audit_log" ADD CONSTRAINT "portal_audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_audit_log" ADD CONSTRAINT "portal_audit_log_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_created_by_employee_id_users_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tds_challan_records" ADD CONSTRAINT "tds_challan_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_org_id_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_org_id_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invites_org_email_idx" ON "invites" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_resource_action_idx" ON "permissions" USING btree ("resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_pk" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_org_name_idx" ON "roles" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_pk" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_org_email_idx" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_org_id_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_entities_org_idx" ON "legal_entities" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_entities_org_code_idx" ON "legal_entities" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_policies_org_idx" ON "sla_policies" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_pk" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_org_idx" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_activity_logs_ticket_idx" ON "ticket_activity_logs" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_activity_logs_created_at_idx" ON "ticket_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_categories_org_idx" ON "ticket_categories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_handoffs_org_ticket_idx" ON "ticket_handoffs" USING btree ("org_id","ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_priorities_org_idx" ON "ticket_priorities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_relations_source_idx" ON "ticket_relations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_relations_target_idx" ON "ticket_relations" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_statuses_org_idx" ON "ticket_statuses" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_watchers_pk" ON "ticket_watchers" USING btree ("ticket_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_org_number_idx" ON "tickets" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_org_idx" ON "tickets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_status_idx" ON "tickets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_assignee_idx" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_requester_idx" ON "tickets" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_created_at_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_parent_ticket_id_idx" ON "tickets" USING btree ("parent_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_idempotency_key_idx" ON "tickets" USING btree ("org_id","idempotency_key") WHERE "tickets"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_org_idx" ON "assignment_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_entity_type_idx" ON "assignment_rules" USING btree ("org_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_assignment_stats_pk" ON "user_assignment_stats" USING btree ("org_id","user_id","entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_history_asset_idx" ON "asset_history" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_types_org_idx" ON "asset_types" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assets_org_tag_idx" ON "assets" USING btree ("org_id","asset_tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_org_idx" ON "assets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_owner_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_status_idx" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_items_org_idx" ON "ci_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_items_type_idx" ON "ci_items" USING btree ("ci_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ci_items_org_external_key_uidx" ON "ci_items" USING btree ("org_id","external_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_relationships_source_idx" ON "ci_relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ci_relationships_target_idx" ON "ci_relationships" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "license_assignments_license_idx" ON "license_assignments" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "software_licenses_org_idx" ON "software_licenses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_started_at_idx" ON "workflow_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_runs_run_idx" ON "workflow_step_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_org_idx" ON "workflows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_active_idx" ON "workflows" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_org_employee_date_idx" ON "attendance_records" USING btree ("org_id","employee_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_org_date_idx" ON "attendance_records" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employees_org_employee_id_idx" ON "employees" USING btree ("org_id","employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_org_idx" ON "employees" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employees_user_idx" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_org_idx" ON "expense_claims" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_employee_idx" ON "expense_claims" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_claims_status_idx" ON "expense_claims" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_number_org_idx" ON "expense_claims" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_case_tasks_case_idx" ON "hr_case_tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_cases_org_idx" ON "hr_cases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_cases_employee_idx" ON "hr_cases" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leave_balances_employee_type_year_idx" ON "leave_balances" USING btree ("employee_id","type","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_org_idx" ON "leave_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_objectives_org_idx" ON "okr_objectives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "okr_objectives_owner_idx" ON "okr_objectives" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_templates_org_idx" ON "onboarding_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_org_month_year_idx" ON "payroll_runs" USING btree ("org_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_runs_org_idx" ON "payroll_runs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payslips_employee_month_year_idx" ON "payslips" USING btree ("employee_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payslips_org_idx" ON "payslips" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payslips_payroll_run_idx" ON "payslips" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_holidays_org_year_idx" ON "public_holidays" USING btree ("org_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_holidays_org_date_idx" ON "public_holidays" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_structures_org_idx" ON "salary_structures" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_chains_org_idx" ON "approval_chains" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_entity_idx" ON "approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_approver_idx" ON "approval_requests" USING btree ("approver_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grns_org_grn_number_idx" ON "goods_receipt_notes" USING btree ("org_id","grn_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_po_idx" ON "goods_receipt_notes" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_line_items_grn_idx" ON "grn_line_items" USING btree ("grn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_invoice_number_idx" ON "invoices" USING btree ("org_id","invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_idx" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_org_flow_idx" ON "invoices" USING btree ("org_id","invoice_flow");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_po_idx" ON "invoices" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_e_invoice_status_idx" ON "invoices" USING btree ("org_id","e_invoice_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_line_items_po_idx" ON "po_line_items" USING btree ("po_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_org_po_number_idx" ON "purchase_orders" USING btree ("org_id","po_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_org_idx" ON "purchase_orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_legal_entity_idx" ON "purchase_orders" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_request_items_pr_idx" ON "purchase_request_items" USING btree ("pr_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_org_number_idx" ON "purchase_requests" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_requests_org_idx" ON "purchase_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_requests_status_idx" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_requests_idempotency_key_idx" ON "purchase_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_org_idx" ON "vendors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_gstin_idx" ON "vendors" USING btree ("gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_org_idx" ON "announcements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_article_revisions_article_idx" ON "kb_article_revisions" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kb_article_revisions_article_version_uidx" ON "kb_article_revisions" USING btree ("article_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_articles_org_idx" ON "kb_articles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_articles_status_idx" ON "kb_articles" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_templates_org_idx" ON "request_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_logs_org_idx" ON "ai_usage_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_logs_created_at_idx" ON "ai_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_logs_integration_idx" ON "integration_sync_logs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_sync_logs_created_at_idx" ON "integration_sync_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_org_provider_idx" ON "integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_next_retry_idx" ON "webhook_deliveries" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_org_idx" ON "webhooks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_org_idx" ON "inventory_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_items_part_num_idx" ON "inventory_items" USING btree ("part_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_tx_org_idx" ON "inventory_transactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_tx_item_idx" ON "inventory_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wo_tasks_wo_idx" ON "work_order_tasks" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_org_idx" ON "work_orders" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_org_number_idx" ON "work_orders" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_state_idx" ON "work_orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_orders_assignee_idx" ON "work_orders" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_approvals_change_idx" ON "change_approvals" USING btree ("change_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_blackout_windows_org_idx" ON "change_blackout_windows" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "change_requests_org_number_idx" ON "change_requests" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_requests_org_idx" ON "change_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_requests_status_idx" ON "change_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_requests_created_at_idx" ON "change_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "known_errors_org_idx" ON "known_errors" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "problems_org_number_idx" ON "problems" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "problems_org_idx" ON "problems" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_org_idx" ON "releases" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sec_incidents_org_number_idx" ON "security_incidents" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_incidents_org_idx" ON "security_incidents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sec_incidents_status_idx" ON "security_incidents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_org_idx" ON "vulnerabilities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_status_idx" ON "vulnerabilities" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_cve_idx" ON "vulnerabilities" USING btree ("cve_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_findings_audit_plan_idx" ON "audit_findings" USING btree ("audit_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_findings_org_idx" ON "audit_findings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_findings_remediation_status_idx" ON "audit_findings" USING btree ("remediation_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_plans_org_idx" ON "audit_plans" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_org_idx" ON "policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_status_idx" ON "policies" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_control_evidence_org_idx" ON "risk_control_evidence" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_control_evidence_control_idx" ON "risk_control_evidence" USING btree ("control_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risk_controls_org_number_idx" ON "risk_controls" USING btree ("org_id","control_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risk_controls_org_idx" ON "risk_controls" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "risks_org_number_idx" ON "risks" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risks_org_idx" ON "risks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "risks_status_idx" ON "risks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_risks_org_idx" ON "vendor_risks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_lines_org_idx" ON "budget_lines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_lines_year_idx" ON "budget_lines" USING btree ("org_id","fiscal_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chargebacks_org_idx" ON "chargebacks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chargebacks_period_idx" ON "chargebacks" USING btree ("org_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_obligations_contract_idx" ON "contract_obligations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_obligations_status_idx" ON "contract_obligations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_org_number_idx" ON "contracts" USING btree ("org_id","contract_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_org_idx" ON "contracts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_end_date_idx" ON "contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_org_idx" ON "project_dependencies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_from_idx" ON "project_dependencies" USING btree ("from_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_dependencies_to_idx" ON "project_dependencies" USING btree ("to_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_dependencies_pair_uidx" ON "project_dependencies" USING btree ("from_project_id","to_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_project_idx" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_status_idx" ON "project_tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_assignee_idx" ON "project_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_number_idx" ON "projects" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_org_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_initiative_idx" ON "projects" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategic_initiatives_org_idx" ON "strategic_initiatives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_accounts_org_idx" ON "crm_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_accounts_owner_idx" ON "crm_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_org_idx" ON "crm_activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_deal_idx" ON "crm_activities" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_owner_idx" ON "crm_activities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_org_idx" ON "crm_contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_account_idx" ON "crm_contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deals_org_idx" ON "crm_deals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deals_stage_idx" ON "crm_deals" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_deals_owner_idx" ON "crm_deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_org_idx" ON "crm_leads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_leads_status_idx" ON "crm_leads" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_quotes_org_number_idx" ON "crm_quotes" USING btree ("org_id","quote_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_quotes_org_idx" ON "crm_quotes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_quotes_deal_idx" ON "crm_quotes" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investigations_org_idx" ON "investigations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investigations_status_idx" ON "investigations" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_matters_org_number_idx" ON "legal_matters" USING btree ("org_id","matter_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_matters_org_idx" ON "legal_matters" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_matters_status_idx" ON "legal_matters" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_matters_next_hearing_idx" ON "legal_matters" USING btree ("org_id","next_hearing_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_requests_org_idx" ON "legal_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_requests_status_idx" ON "legal_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buildings_org_idx" ON "buildings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_requests_org_idx" ON "facility_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facility_requests_status_idx" ON "facility_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_requests_org_idx" ON "move_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_room_idx" ON "room_bookings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_time_idx" ON "room_bookings" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_building_idx" ON "rooms" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_org_idx" ON "deployments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_env_idx" ON "deployments" USING btree ("org_id","environment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_status_idx" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_started_at_idx" ON "deployments" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_org_idx" ON "pipeline_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_runs_started_at_idx" ON "pipeline_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_invites_token_hash_uidx" ON "survey_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_invites_org_idx" ON "survey_invites" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_invites_ticket_idx" ON "survey_invites" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_survey_idx" ON "survey_responses" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_respondent_idx" ON "survey_responses" USING btree ("respondent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "surveys_org_idx" ON "surveys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "surveys_status_idx" ON "surveys" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_feedback_article_idx" ON "kb_feedback" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_steps_request_idx" ON "approval_steps" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_steps_approver_idx" ON "approval_steps" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_prefs_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_org_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_org_idx" ON "applications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_lifecycle_idx" ON "applications" USING btree ("org_id","lifecycle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oncall_overrides_schedule_idx" ON "oncall_overrides" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oncall_schedules_org_idx" ON "oncall_schedules" USING btree ("org_id");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "catalog_items_org_idx" ON "catalog_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_status_idx" ON "catalog_items" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_category_idx" ON "catalog_items" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_requests_org_idx" ON "catalog_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_requests_status_idx" ON "catalog_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_requests_requester_idx" ON "catalog_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_requests_batch_idx" ON "catalog_requests" USING btree ("org_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_calendar_org_idx" ON "compliance_calendar_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_calendar_due_date_idx" ON "compliance_calendar_items" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_calendar_status_idx" ON "compliance_calendar_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "directors_org_din_idx" ON "directors" USING btree ("org_id","din");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directors_org_idx" ON "directors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directors_din_kyc_status_idx" ON "directors" USING btree ("din_kyc_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "epfo_ecr_org_month_year_idx" ON "epfo_ecr_submissions" USING btree ("org_id","month","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "epfo_ecr_org_idx" ON "epfo_ecr_submissions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_audit_log_portal_user_idx" ON "portal_audit_log" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_audit_log_org_idx" ON "portal_audit_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_audit_log_logged_at_idx" ON "portal_audit_log" USING btree ("logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_org_portal_user_id_idx" ON "portal_users" USING btree ("org_id","portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_org_email_idx" ON "portal_users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_users_org_idx" ON "portal_users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_users_status_idx" ON "portal_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tds_challan_records_org_idx" ON "tds_challan_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tds_challan_records_month_year_idx" ON "tds_challan_records" USING btree ("month","year");--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "agent_conversations_org_user_idx" ON "agent_conversations" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conversations_updated_idx" ON "agent_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_conversation_idx" ON "agent_messages" USING btree ("conversation_id","sequence");