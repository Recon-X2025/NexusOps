-- ─────────────────────────────────────────────────────────────────────────────
-- HR cases get a real case number and a real subject.
--
-- Before this, `hr_cases` had neither column, and the list invented both:
--   Case #   = id.slice(-8).toUpperCase()   — not a fallback, the ONLY path
--   Subject  = the NOTES BODY with [RESOLVED:…]/[ARCHIVED:…] stripped by regex
-- A service-desk record with no number and a subject reconstructed from a
-- free-text blob. `number` now comes from `org_counters` via `getNextNumber`,
-- the same path tickets / changes / problems / CSM cases use.
--
-- SAFETY CONTRACT — this migration never destroys anything.
--   • No row is deleted, merged or renumbered.
--   • `number` is added NULLABLE, backfilled deterministically, checked for
--     duplicates, and only then made NOT NULL and uniquely indexed.
--   • If a duplicate somehow exists it RAISES naming the org, the value and the
--     row count, instead of Postgres emitting a bare "is duplicated". Same
--     contract as 0086_aromatic_swarm.
--   • Drizzle wraps each migration in one transaction, so a raise leaves the
--     database exactly as it was.
--
-- IF THIS STOPS YOUR DEPLOY: that is the design (the api container runs
-- `migrate && index`, so the previous container keeps serving). Read the RAISE,
-- decide with the product owner which record keeps the number, correct the rows,
-- redeploy. Do not drop the check.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "hr_cases" ADD COLUMN "number" text;--> statement-breakpoint
ALTER TABLE "hr_cases" ADD COLUMN "subject" text;--> statement-breakpoint

-- Backfill `number`: HRC-0001 upward, per org, oldest case first so the numbering
-- matches the order the cases were actually opened. Deterministic — no randomness,
-- no count(*)+1 race (this runs once, inside the migration transaction).
UPDATE "hr_cases" AS h
SET "number" = 'HRC-' || LPAD(s.rn::text, 4, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at, id) AS rn
  FROM "hr_cases"
) AS s
WHERE h.id = s.id;--> statement-breakpoint

-- Backfill `subject` from exactly what the UI regex was already extracting: the
-- notes body with the [RESOLVED:…] / [ARCHIVED:…] markers removed, first line
-- only, trimmed to a sane subject length.
--
-- WHERE THE REGEX YIELDS NOTHING THE SUBJECT IS LEFT NULL — deliberately. An
-- empty subject is honest: that case never had one. Inventing "HR case" or
-- copying the case type would fabricate a summary nobody wrote, and the whole
-- point of this change is to stop showing a reconstructed subject as if it were
-- real. The list renders an em-dash for these, and they can be filled in by hand.
UPDATE "hr_cases"
SET "subject" = NULLIF(
  LEFT(
    TRIM(
      SPLIT_PART(
        REGEXP_REPLACE(COALESCE("notes", ''), '\[(RESOLVED|ARCHIVED):[^\]]*\]\s*', '', 'g'),
        E'\n', 1
      )
    ),
    200
  ),
  ''
);--> statement-breakpoint

-- Duplicate guard — 0086 contract. Cannot fire given the deterministic backfill
-- above, which is exactly why it is cheap to keep: it costs one scan and turns a
-- future surprise into a named error rather than an opaque index failure.
DO $$
DECLARE
  dup       RECORD;
  found_any BOOLEAN := FALSE;
  report    TEXT := '';
BEGIN
  FOR dup IN
    SELECT org_id, "number" AS val, COUNT(*) AS n
    FROM "hr_cases"
    WHERE "number" IS NOT NULL
    GROUP BY org_id, "number"
    HAVING COUNT(*) > 1
  LOOP
    found_any := TRUE;
    report := report || format(
      E'\n  hr_cases.number = %L in org %s — %s rows',
      dup.val, dup.org_id, dup.n
    );
  END LOOP;

  IF found_any THEN
    RAISE EXCEPTION
      'Cannot create unique index hr_cases_org_number_idx — duplicate case numbers exist:%s%s',
      report,
      E'\n\nNothing has been changed. Decide which record keeps each number, correct the rows, and re-run.';
  END IF;

  -- Any row still without a number would violate NOT NULL below; name it rather
  -- than let the ALTER fail bare.
  IF EXISTS (SELECT 1 FROM "hr_cases" WHERE "number" IS NULL) THEN
    RAISE EXCEPTION
      'hr_cases has % row(s) with a NULL number after backfill — refusing to set NOT NULL.',
      (SELECT COUNT(*) FROM "hr_cases" WHERE "number" IS NULL);
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "hr_cases" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hr_cases_org_number_idx" ON "hr_cases" USING btree ("org_id","number");--> statement-breakpoint

-- Advance org_counters so the FIRST case created after this migration continues
-- from the backfill instead of colliding with HRC-0001. `syncOrgCounters` would
-- also do this at startup (HRC is registered in COUNTER_SPECS), but doing it here
-- means the counter is correct the moment the migration lands, not one boot later.
INSERT INTO org_counters (org_id, entity, current_value)
SELECT org_id, 'HRC', MAX(CAST(SUBSTRING("number" FROM '[0-9]+$') AS BIGINT))
FROM "hr_cases"
GROUP BY org_id
ON CONFLICT (org_id, entity) DO UPDATE
  SET current_value = GREATEST(org_counters.current_value, EXCLUDED.current_value);
