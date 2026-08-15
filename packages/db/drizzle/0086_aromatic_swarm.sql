-- ─────────────────────────────────────────────────────────────────────────────
-- Uniqueness on user-facing identifier columns (Round 7).
--
-- Nine tables generate a value that is shown to a user as THAT RECORD'S
-- IDENTIFIER (a case number, a report number, a finding number, an SLA display
-- id) with no unique index behind it. Two records could carry the same
-- identifier, which makes a support conversation ambiguous and a filing
-- reference wrong.
--
-- SAFETY CONTRACT — this migration NEVER destroys anything.
--   • It does NOT delete, merge or renumber a single row.
--   • Before each CREATE UNIQUE INDEX it looks for duplicates and, if it finds
--     any, RAISES with the table, the duplicated value, the owning org and the
--     number of rows involved — instead of letting Postgres emit a bare
--     "could not create unique index ... is duplicated" with no context.
--   • The whole file runs in one transaction (drizzle wraps each migration), so
--     a raise leaves the database exactly as it was. Nothing is half-applied.
--
-- IF THIS MIGRATION STOPS YOUR DEPLOY: that is the design. The api container
-- runs `node dist/migrate.mjs && node dist/index.mjs`, so the server will not
-- start and the previous container keeps serving. Read the RAISE message, decide
-- with the product owner how the duplicate records should be renumbered (which
-- of the two keeps the identifier is a business decision, not a technical one),
-- correct the rows, and re-deploy. Do not "fix" this by dropping the check.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  spec        RECORD;
  dup         RECORD;
  dup_sql     TEXT;
  found_any   BOOLEAN := FALSE;
  report      TEXT := '';
BEGIN
  -- (table, identifier column) pairs about to be constrained, org-scoped.
  FOR spec IN
    SELECT * FROM (VALUES
      ('threat_intelligence', 'number'),
      ('audit_findings',      'finding_number'),
      ('csm_cases',           'number'),
      ('surveys',             'number'),
      ('expense_reports',     'number'),
      ('job_requisitions',    'number'),
      ('board_meetings',      'number'),
      ('board_resolutions',   'number'),
      ('sla_definitions',     'display_id')
    ) AS t(tbl, col)
  LOOP
    -- Skip a table that does not exist in this database rather than failing on it.
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      CONTINUE;
    END IF;

    dup_sql := format(
      'SELECT org_id::text AS org_id, %I::text AS val, count(*) AS n
         FROM %I
        WHERE %I IS NOT NULL
        GROUP BY org_id, %I
       HAVING count(*) > 1
        ORDER BY count(*) DESC, %I
        LIMIT 20',
      spec.col, spec.tbl, spec.col, spec.col, spec.col
    );

    FOR dup IN EXECUTE dup_sql LOOP
      found_any := TRUE;
      report := report || format(
        E'\n  %s.%s = %L  (org %s, %s rows)',
        spec.tbl, spec.col, dup.val, dup.org_id, dup.n
      );
    END LOOP;
  END LOOP;

  IF found_any THEN
    RAISE EXCEPTION
      E'Cannot enforce identifier uniqueness — duplicate identifiers already exist.\n'
      'NOTHING HAS BEEN CHANGED; this migration does not renumber or delete rows.\n'
      'Duplicates found (up to 20 per table):%s\n\n'
      'Remedy: decide with the product owner which record keeps each identifier, '
      'renumber the other(s), then re-run the deploy. The generators for '
      'expense_reports, sla_definitions, board_meetings, board_resolutions and '
      'job_requisitions were also corrected in this release, so new duplicates '
      'will not accumulate while you resolve these.',
      report;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threat_intelligence_org_number_idx" ON "threat_intelligence" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_findings_org_number_idx" ON "audit_findings" USING btree ("org_id","finding_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "csm_cases_org_number_idx" ON "csm_cases" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "surveys_org_number_idx" ON "surveys" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_reports_org_number_idx" ON "expense_reports" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_req_org_number_idx" ON "job_requisitions" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_meeting_org_number_idx" ON "board_meetings" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resolution_org_number_idx" ON "board_resolutions" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sla_definitions_org_display_id_idx" ON "sla_definitions" USING btree ("org_id","display_id");
