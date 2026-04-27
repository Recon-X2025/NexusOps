-- Optional free-text notes on contracts (contract detail UI).
-- Idempotent: safe to re-run.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "notes" text;
