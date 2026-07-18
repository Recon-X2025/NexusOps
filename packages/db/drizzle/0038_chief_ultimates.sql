-- DPDP Aadhaar minimisation — drop the raw `aadhaar` columns.
--
-- SAFETY GUARD: the masked columns (aadhaar_masked_hash) are derived by an application-layer
-- backfill (scripts/backfill-pii-mask.cjs) because the hash is a PEPPERED HMAC that cannot be
-- computed in pure SQL. This migration therefore refuses to drop the raw column while any row
-- still carries a raw Aadhaar that has NOT yet been backfilled into aadhaar_masked_hash. If the
-- guard trips, run the backfill script first, then re-run the migration.
--
-- The check is written as an anonymous PL/pgSQL block that RAISES (aborting the transaction)
-- when unbackfilled rows exist. Rows with a NULL raw Aadhaar are fine (nothing to lose).

DO $$
DECLARE
  unbackfilled_employees bigint;
  unbackfilled_directors bigint;
BEGIN
  SELECT count(*) INTO unbackfilled_employees
    FROM "employees"
    WHERE "aadhaar" IS NOT NULL AND "aadhaar_masked_hash" IS NULL;

  SELECT count(*) INTO unbackfilled_directors
    FROM "directors"
    WHERE "aadhaar" IS NOT NULL AND "aadhaar_masked_hash" IS NULL;

  IF unbackfilled_employees > 0 OR unbackfilled_directors > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop raw aadhaar: % employee(s) and % director(s) still hold a raw Aadhaar with no masked hash. Run scripts/backfill-pii-mask.cjs (needs PII_HASH_PEPPER) before applying migration 0037.',
      unbackfilled_employees, unbackfilled_directors;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN IF EXISTS "aadhaar";--> statement-breakpoint
ALTER TABLE "directors" DROP COLUMN IF EXISTS "aadhaar";
