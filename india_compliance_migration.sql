-- India Compliance migration — IF NOT EXISTS guards throughout

DO $$ BEGIN CREATE TYPE compliance_item_status AS ENUM ('upcoming','due_soon','overdue','filed','not_applicable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE compliance_type AS ENUM ('annual','event_based','monthly','quarterly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE din_kyc_status AS ENUM ('active','deactivated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE director_type AS ENUM ('executive','non_executive','independent','nominee'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE portal_user_status AS ENUM ('pending_approval','active','inactive','suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE portal_user_role AS ENUM ('primary_contact','secondary_contact','read_only'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE mfa_type AS ENUM ('otp_email','otp_sms','totp_app'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tds_form_type AS ENUM ('24Q','26Q','27Q','27EQ'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ecr_submission_status AS ENUM ('generated','submitted','acknowledged','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS compliance_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_type compliance_type NOT NULL DEFAULT 'annual',
  event_name TEXT NOT NULL,
  mca_form TEXT,
  financial_year TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  status compliance_item_status NOT NULL DEFAULT 'upcoming',
  reminder_days_before INTEGER[] NOT NULL DEFAULT '{30,15,7,1}',
  filed_date TIMESTAMPTZ,
  srn TEXT,
  ack_document_url TEXT,
  penalty_per_day_inr NUMERIC(10,2) NOT NULL DEFAULT 0,
  days_overdue INTEGER NOT NULL DEFAULT 0,
  total_penalty_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_calendar_org_idx ON compliance_calendar_items(org_id);
CREATE INDEX IF NOT EXISTS compliance_calendar_due_date_idx ON compliance_calendar_items(due_date);
CREATE INDEX IF NOT EXISTS compliance_calendar_status_idx ON compliance_calendar_items(status);

CREATE TABLE IF NOT EXISTS directors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  din TEXT NOT NULL,
  full_name TEXT NOT NULL,
  pan TEXT,
  aadhaar TEXT,
  date_of_birth TIMESTAMPTZ,
  nationality TEXT NOT NULL DEFAULT 'Indian',
  residential_status TEXT NOT NULL DEFAULT 'resident',
  residential_address TEXT,
  director_type director_type NOT NULL DEFAULT 'executive',
  date_of_appointment TIMESTAMPTZ,
  date_of_cessation TIMESTAMPTZ,
  din_kyc_status din_kyc_status NOT NULL DEFAULT 'active',
  din_kyc_last_completed TIMESTAMPTZ,
  dsc_details JSONB NOT NULL DEFAULT '[]',
  linked_employee_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS directors_org_din_idx ON directors(org_id, din);
CREATE INDEX IF NOT EXISTS directors_org_idx ON directors(org_id);
CREATE INDEX IF NOT EXISTS directors_din_kyc_status_idx ON directors(din_kyc_status);

CREATE TABLE IF NOT EXISTS portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portal_user_id TEXT NOT NULL,
  customer_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  password_version INTEGER NOT NULL DEFAULT 1,
  password_changed_at TIMESTAMPTZ,
  role portal_user_role NOT NULL DEFAULT 'primary_contact',
  status portal_user_status NOT NULL DEFAULT 'pending_approval',
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_type mfa_type,
  totp_secret TEXT,
  last_login_at TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  lock_reason TEXT,
  is_self_registered BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_employee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_org_portal_user_id_idx ON portal_users(org_id, portal_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_org_email_idx ON portal_users(org_id, email);
CREATE INDEX IF NOT EXISTS portal_users_org_idx ON portal_users(org_id);
CREATE INDEX IF NOT EXISTS portal_users_status_idx ON portal_users(status);

CREATE TABLE IF NOT EXISTS portal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portal_user_id UUID REFERENCES portal_users(id) ON DELETE SET NULL,
  customer_id UUID,
  action TEXT NOT NULL,
  endpoint TEXT,
  http_method TEXT,
  ip_address TEXT,
  user_agent TEXT,
  response_status_code INTEGER,
  metadata JSONB,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_audit_log_portal_user_idx ON portal_audit_log(portal_user_id);
CREATE INDEX IF NOT EXISTS portal_audit_log_org_idx ON portal_audit_log(org_id);
CREATE INDEX IF NOT EXISTS portal_audit_log_logged_at_idx ON portal_audit_log(logged_at);

CREATE TABLE IF NOT EXISTS tds_challan_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tds_section TEXT NOT NULL,
  form_type tds_form_type NOT NULL DEFAULT '24Q',
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_tds_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tds_deposited NUMERIC(14,2) NOT NULL DEFAULT 0,
  bsr_code TEXT,
  challan_serial_number TEXT,
  payment_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tds_challan_records_org_idx ON tds_challan_records(org_id);
CREATE INDEX IF NOT EXISTS tds_challan_records_month_year_idx ON tds_challan_records(month, year);

CREATE TABLE IF NOT EXISTS epfo_ecr_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  ecr_file_url TEXT,
  submission_status ecr_submission_status NOT NULL DEFAULT 'generated',
  epfo_ack_number TEXT,
  total_employee_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_employer_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_eps_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_epf_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS epfo_ecr_org_month_year_idx ON epfo_ecr_submissions(org_id, month, year);
CREATE INDEX IF NOT EXISTS epfo_ecr_org_idx ON epfo_ecr_submissions(org_id);

SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('tds_challan_records','epfo_ecr_submissions','compliance_calendar_items','directors','portal_users','portal_audit_log') ORDER BY tablename;
