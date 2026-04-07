-- Add embedding_vector, external_id, and external_source to tickets table.
-- These columns were added to the Drizzle schema after the initial migration
-- was generated and therefore were never applied to existing databases.
-- Idempotent: safe to re-run.
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "embedding_vector" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "external_source" text;
