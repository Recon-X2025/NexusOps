-- US-SEC-001: org-level MFA matrix policy reads users.mfa_enrolled (productized enrollment flag).
-- US-ITSM-006: idempotent CMDB bulk import keyed by optional external_key per org.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enrolled" boolean DEFAULT false NOT NULL;

ALTER TABLE "ci_items" ADD COLUMN IF NOT EXISTS "external_key" text;

-- Full (non-partial) unique index: required for INSERT … ON CONFLICT ("org_id","external_key").
-- Postgres treats NULLs as distinct in unique checks, so many rows may share (org_id, NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "ci_items_org_external_key_uidx" ON "ci_items" ("org_id", "external_key");
