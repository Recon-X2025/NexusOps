ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "pipeline_status" text DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "run_number" integer DEFAULT 1 NOT NULL;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "workflow_metadata" jsonb DEFAULT '{"errors":[],"approvals":[]}'::jsonb NOT NULL;

UPDATE "payroll_runs"
SET "pipeline_status" = CASE "status"::text
  WHEN 'draft' THEN 'DRAFT'
  WHEN 'under_review' THEN 'PAYSLIPS_GENERATED'
  WHEN 'hr_approved' THEN 'HR_APPROVED'
  WHEN 'finance_approved' THEN 'FINANCE_APPROVED'
  WHEN 'cfo_approved' THEN 'CFO_APPROVED'
  WHEN 'paid' THEN 'COMPLETED'
  ELSE 'DRAFT'
END;
