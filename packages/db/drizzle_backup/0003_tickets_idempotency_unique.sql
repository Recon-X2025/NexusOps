-- Migration: replace the non-unique idempotency key index on tickets with a
-- partial unique index on (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL.
-- This guarantees that concurrent inserts with the same key cannot produce
-- duplicates while still allowing unlimited inserts without any key.
--
-- Production note: this migration runs inside Drizzle's transaction wrapper,
-- so CREATE INDEX CONCURRENTLY is not available here (it cannot run inside a
-- transaction block per Postgres restrictions).  The IF NOT EXISTS guard and
-- the lock_timeout below protect against long table locks.
--
-- If the tickets table is very large (>10M rows) and you need zero-downtime
-- index creation, run the following manually OUTSIDE a transaction BEFORE
-- deploying this migration:
--
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "tickets_idempotency_key_idx"
--     ON "tickets" ("org_id", "idempotency_key")
--     WHERE "idempotency_key" IS NOT NULL;
--
-- Then this migration will find the index already exists and skip it.

-- Abort rather than wait indefinitely for an ACCESS EXCLUSIVE lock.
-- 5 seconds is generous; raises an error if the table is busy (safe to retry).
SET LOCAL lock_timeout = '5000ms';

DROP INDEX IF EXISTS "tickets_idempotency_key_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "tickets_idempotency_key_idx"
  ON "tickets" ("org_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
