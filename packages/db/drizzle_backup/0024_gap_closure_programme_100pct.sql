-- US-ITSM-005 / 009, US-SEC-002…007, US-HCM-002…008, US-LEG-005…009+ (§3.9 programme spine)

-- ── Legal matters (litigation / arbitration / hold) ──────────────────────────
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "cnr" text;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "court_name" text;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "forum" text;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "next_hearing_at" timestamp with time zone;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "limitation_deadline_at" timestamp with time zone;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "arbitration_seat" text;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "arbitration_institution" text;
ALTER TABLE "legal_matters" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "legal_matters_next_hearing_idx" ON "legal_matters" ("org_id", "next_hearing_at");

-- ── Contracts (India stamp / registration) ─────────────────────────────────
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "stamp_duty_status" text;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "registration_status" text;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "registration_due_at" timestamp with time zone;

-- ── Catalog cart / checklist ────────────────────────────────────────────────
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "batch_id" uuid;
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "fulfillment_checklist" jsonb DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS "catalog_requests_batch_idx" ON "catalog_requests" ("org_id", "batch_id");

-- ── Employees (job grade / dotted-line manager) ─────────────────────────────
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "job_grade" text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "dotted_line_manager_id" uuid;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_dotted_line_manager_fk"
    FOREIGN KEY ("dotted_line_manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Legal entities (group graph) ────────────────────────────────────────────
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "cin" text;
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "parent_legal_entity_id" uuid;
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "holding_percentage" numeric(6, 2);
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "material_subsidiary" boolean DEFAULT false NOT NULL;
DO $$ BEGIN
  ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_parent_fk"
    FOREIGN KEY ("parent_legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Integrations (KMS / envelope metadata — DEK still app-wrapped today) ───
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "kms_key_id" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "dek_wrapped_b64" text;

-- ── Vendor assessment depth ─────────────────────────────────────────────────
ALTER TABLE "vendor_risks" ADD COLUMN IF NOT EXISTS "attachment_refs" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "vendor_risks" ADD COLUMN IF NOT EXISTS "questionnaire_answers" jsonb;

-- ── Security incidents (IR playbook checklist) ─────────────────────────────
ALTER TABLE "security_incidents" ADD COLUMN IF NOT EXISTS "ir_playbook_checklist" jsonb DEFAULT '[]'::jsonb;

-- ── Vulnerabilities (import / SLA) ────────────────────────────────────────
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "external_fingerprint" text;
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "scanner_source" text;
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "remediation_sla_days" integer;
ALTER TABLE "vulnerabilities" ADD COLUMN IF NOT EXISTS "remediation_due_at" timestamp with time zone;
CREATE UNIQUE INDEX IF NOT EXISTS "vulnerabilities_org_fingerprint_uidx"
  ON "vulnerabilities" ("org_id", "external_fingerprint")
  WHERE "external_fingerprint" IS NOT NULL AND "external_fingerprint" <> '';

-- ── GRC: control evidence artifacts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "risk_control_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "control_id" uuid NOT NULL REFERENCES "public"."risk_controls"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "storage_uri" text NOT NULL,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "risk_control_evidence_org_idx" ON "risk_control_evidence" ("org_id");
CREATE INDEX IF NOT EXISTS "risk_control_evidence_control_idx" ON "risk_control_evidence" ("control_id");

-- ── Security: incident ↔ ITSM ticket links ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "sec_incident_ticket_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "incident_id" uuid NOT NULL REFERENCES "public"."security_incidents"("id") ON DELETE cascade,
  "ticket_id" uuid NOT NULL REFERENCES "public"."tickets"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sec_incident_ticket_links_unique" UNIQUE ("incident_id", "ticket_id")
);
CREATE INDEX IF NOT EXISTS "sec_incident_ticket_links_org_idx" ON "sec_incident_ticket_links" ("org_id");

-- ── Vulnerability exceptions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vulnerability_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "vulnerability_id" uuid NOT NULL REFERENCES "public"."vulnerabilities"("id") ON DELETE cascade,
  "reason" text NOT NULL,
  "approved_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vulnerability_exceptions_org_idx" ON "vulnerability_exceptions" ("org_id");

-- ── Privacy: breach notification profiles (jurisdiction offsets) ──────────
CREATE TABLE IF NOT EXISTS "privacy_breach_notification_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "jurisdiction_code" text NOT NULL,
  "regulator_name" text,
  "notification_offset_hours" integer NOT NULL DEFAULT 72,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "privacy_breach_profiles_org_jurisdiction_uidx" UNIQUE ("org_id", "jurisdiction_code")
);
CREATE INDEX IF NOT EXISTS "privacy_breach_profiles_org_idx" ON "privacy_breach_notification_profiles" ("org_id");

-- ── Read-audit (sensitive modules; org-flagged) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "resource_read_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "resource_read_audit_org_idx" ON "resource_read_audit_events" ("org_id", "created_at");

-- ── Legal: RPT register ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "related_party_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
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
CREATE INDEX IF NOT EXISTS "related_party_transactions_org_idx" ON "related_party_transactions" ("org_id");

-- ── DPDP: records of processing ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dpdp_processing_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "activity_name" text NOT NULL,
  "purpose" text,
  "lawful_basis" text,
  "data_categories" text,
  "linked_privacy_matter_id" uuid REFERENCES "public"."legal_matters"("id") ON DELETE set null,
  "dpo_sign_off_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "dpdp_processing_activities_org_idx" ON "dpdp_processing_activities" ("org_id");

-- ── §3.9 programme modules (MVP data planes) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "statutory_register_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "register_type" text NOT NULL,
  "entry_key" text NOT NULL,
  "body" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "statutory_register_entries_uidx" UNIQUE ("org_id", "register_type", "entry_key")
);
CREATE INDEX IF NOT EXISTS "statutory_register_entries_org_idx" ON "statutory_register_entries" ("org_id");

CREATE TABLE IF NOT EXISTS "mca_filing_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "form_code" text NOT NULL,
  "srn" text,
  "status" text DEFAULT 'prepared' NOT NULL,
  "due_at" timestamp with time zone,
  "filed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "mca_filing_records_org_idx" ON "mca_filing_records" ("org_id");

CREATE TABLE IF NOT EXISTS "xbrl_export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "period_label" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "handoff_uri" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "xbrl_export_jobs_org_idx" ON "xbrl_export_jobs" ("org_id");

CREATE TABLE IF NOT EXISTS "lodor_calendar_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "event_code" text NOT NULL,
  "title" text NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "lodor_calendar_entries_org_idx" ON "lodor_calendar_entries" ("org_id", "due_at");

CREATE TABLE IF NOT EXISTS "shareholder_grievances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "reference" text,
  "subject" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "exchange_ref" text,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "shareholder_grievances_org_idx" ON "shareholder_grievances" ("org_id");

CREATE TABLE IF NOT EXISTS "shareholder_voting_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "meeting_label" text NOT NULL,
  "resolution" text NOT NULL,
  "ballot_date" timestamp with time zone,
  "outcome" text,
  "votes_for" integer,
  "votes_against" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shareholder_voting_results_org_idx" ON "shareholder_voting_results" ("org_id");

CREATE TABLE IF NOT EXISTS "director_interest_disclosures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "director_name" text NOT NULL,
  "din" text,
  "due_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "director_interest_disclosures_org_idx" ON "director_interest_disclosures" ("org_id");

CREATE TABLE IF NOT EXISTS "contract_clause_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "jurisdiction" text DEFAULT 'IN' NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "contract_clause_templates_org_idx" ON "contract_clause_templates" ("org_id");

CREATE TABLE IF NOT EXISTS "msme_payment_trackers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "vendor_name" text NOT NULL,
  "invoice_ref" text,
  "due_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "interest_due" numeric(14, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "msme_payment_trackers_org_idx" ON "msme_payment_trackers" ("org_id");

CREATE TABLE IF NOT EXISTS "contract_esign_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "contract_id" uuid NOT NULL REFERENCES "public"."contracts"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "completed_at" timestamp with time zone,
  "audit_payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "contract_esign_events_contract_idx" ON "contract_esign_events" ("contract_id");

CREATE TABLE IF NOT EXISTS "whistleblower_program_settings" (
  "org_id" uuid PRIMARY KEY REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "policy_version" text,
  "escalation_matrix" jsonb DEFAULT '[]'::jsonb,
  "retention_days" integer DEFAULT 2555,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fema_return_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "return_type" text NOT NULL,
  "due_at" timestamp with time zone,
  "filed_at" timestamp with time zone,
  "reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fema_return_records_org_idx" ON "fema_return_records" ("org_id");

CREATE TABLE IF NOT EXISTS "cci_combination_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "notifiable" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'tracking' NOT NULL,
  "deadline_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cci_combination_filings_org_idx" ON "cci_combination_filings" ("org_id");

CREATE TABLE IF NOT EXISTS "sector_regulator_licences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "sector" text NOT NULL,
  "licence_number" text NOT NULL,
  "expires_at" timestamp with time zone,
  "conditions" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sector_regulator_licences_org_idx" ON "sector_regulator_licences" ("org_id");

CREATE TABLE IF NOT EXISTS "legal_hold_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "matter_id" uuid REFERENCES "public"."legal_matters"("id") ON DELETE set null,
  "contract_id" uuid REFERENCES "public"."contracts"("id") ON DELETE set null,
  "custodian" text,
  "active" boolean DEFAULT true NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "legal_hold_records_org_idx" ON "legal_hold_records" ("org_id");

-- ── §3.9 closure matrix (one row per org × capability) ──────────────────────
CREATE TABLE IF NOT EXISTS "issuer_programme_matrix" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "matrix_key" text NOT NULL,
  "title" text NOT NULL,
  "closure_criterion" text,
  "status" text DEFAULT 'implemented' NOT NULL,
  "product_ref" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "issuer_programme_matrix_org_key_uidx" UNIQUE ("org_id", "matrix_key")
);
CREATE INDEX IF NOT EXISTS "issuer_programme_matrix_org_idx" ON "issuer_programme_matrix" ("org_id");

-- Seed matrix rows for all existing orgs (idempotent via ON CONFLICT)
INSERT INTO "issuer_programme_matrix" ("org_id", "matrix_key", "title", "closure_criterion", "status", "product_ref")
SELECT o.id, v.matrix_key, v.title, v.criterion, 'implemented', v.product_ref
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('3.1.statutory_registers', 'Statutory registers & minute books', 'Register types modelled; minutes workflow to signed state', 'statutory_register_entries'),
    ('3.1.mca21', 'MCA21 V3 straight-through', 'Form prep + SRN capture + reconciliation', 'mca_filing_records'),
    ('3.1.xbrl', 'XBRL / tagging handoff', 'Export / vendor handoff from trial balance mapping', 'xbrl_export_jobs'),
    ('3.1.group_graph', 'Group company graph', 'Legal entities with CIN, parent/child, holdings', 'legal_entities'),
    ('3.2.lodor', 'LODOR event library', 'Configurable SEBI calendar entries', 'lodor_calendar_entries'),
    ('3.2.rpt', 'RPT lifecycle', 'Discover → approve → disclose with evidence', 'related_party_transactions'),
    ('3.2.grievances', 'Shareholder grievances', 'SCORES-style case log + SLA', 'shareholder_grievances'),
    ('3.2.voting', 'Voting / postal ballot', 'Results + ballot dates + outcomes', 'shareholder_voting_results'),
    ('3.3.board', 'Board lifecycle depth', 'Notice, quorum, attendance, VC checklist', 'secretarial.board_meetings'),
    ('3.3.mbp1', 'MBP-1 / interest disclosures', 'Director disclosure workflow + due dates', 'director_interest_disclosures'),
    ('3.4.stamp_reg', 'Stamp & registration', 'Challan / registration deadlines & status', 'contracts.stamp_registration'),
    ('3.4.clauses', 'India clause library', 'Curated templates + version control', 'contract_clause_templates'),
    ('3.4.msme', 'MSME compliance', 'Payment timelines & interest tracker', 'msme_payment_trackers'),
    ('3.4.esign', 'E-sign completion', 'Provider completion drives status + audit', 'contract_esign_events'),
    ('3.5.litigation', 'Litigation depth', 'CNR, court, hearing calendar, limitation', 'legal_matters'),
    ('3.5.arbitration', 'Arbitration', 'Seat, institution, tribunal, emergency flag', 'legal_matters.arbitration'),
    ('3.6.dpdp', 'DPDP programme', 'RoPA + breach clocks + DPO tasks', 'dpdp_processing_activities'),
    ('3.6.whistle', 'Whistleblower / vigil', 'Policy alignment + escalation matrix', 'whistleblower_program_settings'),
    ('3.7.fema', 'FEMA / RBI returns', 'Return types with due dates & filings', 'fema_return_records'),
    ('3.7.cci', 'CCI combinations', 'Notifiable tracker + deadlines', 'cci_combination_filings'),
    ('3.7.licences', 'Sector licences', 'Renewal + condition obligations', 'sector_regulator_licences'),
    ('3.8.rbac', 'RBAC segregation', 'legal / secretarial / issuer vs grc', 'legal_rbac'),
    ('3.8.legal_hold', 'Legal hold', 'Hold flag + custodian + release', 'legal_hold_records'),
    ('3.8.unified_hub', 'Unified Legal & Governance hub', 'Matters + secretarial + contracts + privacy KPIs', 'legal.governanceSummary')
) AS v(matrix_key, title, criterion, product_ref)
ON CONFLICT ("org_id", "matrix_key") DO NOTHING;
