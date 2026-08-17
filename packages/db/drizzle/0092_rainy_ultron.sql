-- Depreciation: make the run idempotent on a CALENDAR period, not an ordinal counter.
--
-- `asset_depreciation_entries.period` is `periods_elapsed + 1`, so the existing
-- unique index on (asset_id, period) only stopped two CONCURRENT runs racing the
-- same ordinal. Three sequential calls in one sitting produced three charges
-- (measured before this change). A scheduled month-end job turns that from
-- possible into certain, so the guard has to key on the period the charge is FOR.
--
-- `period_key` is the India financial year the charge belongs to, formatted
-- exactly as `currentFY()` in apps/api/src/routers/accounting.ts emits it
-- (`2026-2027`; April-March).
--
-- Drizzle generated this as a single `ADD COLUMN ... NOT NULL` with no default,
-- which cannot apply to a table that already holds rows. Hand-written instead:
-- add nullable → backfill → prove no duplicates → enforce.

ALTER TABLE "asset_depreciation_entries" ADD COLUMN "period_key" text;--> statement-breakpoint

-- Backfill: period N of an asset counts as the Nth financial year from the one
-- its register row starts in. Deterministic, and it reproduces exactly what the
-- run would have written had the column existed.
UPDATE "asset_depreciation_entries" e
SET "period_key" = s.fy_start + (e."period" - 1) || '-' || (s.fy_start + e."period")
FROM (
  SELECT
    d."asset_id",
    CASE
      WHEN EXTRACT(MONTH FROM d."start_date") >= 4 THEN EXTRACT(YEAR FROM d."start_date")::int
      ELSE EXTRACT(YEAR FROM d."start_date")::int - 1
    END AS fy_start
  FROM "asset_depreciation" d
) s
WHERE e."asset_id" = s."asset_id" AND e."period_key" IS NULL;--> statement-breakpoint

-- An entry whose register row has since been deleted has no start date to work
-- from; fall back to the financial year the charge was written in.
UPDATE "asset_depreciation_entries"
SET "period_key" =
  CASE
    WHEN EXTRACT(MONTH FROM "created_at") >= 4
      THEN EXTRACT(YEAR FROM "created_at")::int || '-' || (EXTRACT(YEAR FROM "created_at")::int + 1)
    ELSE (EXTRACT(YEAR FROM "created_at")::int - 1) || '-' || EXTRACT(YEAR FROM "created_at")::int
  END
WHERE "period_key" IS NULL;--> statement-breakpoint

-- Detect-and-RAISE before enforcing uniqueness (0086 convention): never delete,
-- merge or renumber a customer's ledger rows. A raise here stops the deploy and
-- leaves the previous api container serving, which is the desired behaviour.
DO $$
DECLARE
  dup RECORD;
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT "asset_id", "period_key"
    FROM "asset_depreciation_entries"
    GROUP BY "asset_id", "period_key"
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    SELECT "asset_id", "period_key", COUNT(*) AS n INTO dup
    FROM "asset_depreciation_entries"
    GROUP BY "asset_id", "period_key"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    RAISE EXCEPTION
      'asset_depreciation_entries: % (asset_id, period_key) pair(s) are duplicated — cannot add a unique index. Worst: asset_id=% period_key=% has % rows (org_id=%). These are double-charged depreciation periods and must be reviewed by finance before this migration can apply; do not delete rows blindly.',
      dup_count, dup."asset_id", dup."period_key", dup.n,
      (SELECT "org_id" FROM "asset_depreciation_entries" WHERE "asset_id" = dup."asset_id" LIMIT 1);
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "asset_depreciation_entries" ALTER COLUMN "period_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_depreciation_entries_asset_period_key_idx" ON "asset_depreciation_entries" USING btree ("asset_id","period_key");
