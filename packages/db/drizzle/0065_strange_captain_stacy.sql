-- 0065_strange_captain_stacy — M-05: salary-structure family versioning.
--
-- Adds `salary_structures.family_id`, the shared identity across every effective-dated
-- version of one logical structure. A new financial-year version is a NEW ROW with the
-- SAME family_id and a later effective_from; the prior version is auto-closed
-- (effective_to = day before the new from) by the app so two are never live at once.
-- Employees link to the FAMILY (employees.salary_structure_id holds a family_id), so a
-- superseded version stays immutable/readable (Form-16, re-runs) while payroll resolves
-- the version whose [effective_from, effective_to) window contains the pay period —
-- mirroring resolveStatutoryCeilings.
--
-- Hand-edited from the drizzle-generated add: the generated `ADD COLUMN ... NOT NULL`
-- would fail on the already-populated table. Instead: add nullable → backfill each
-- existing row to its own id (every current structure becomes a single-version family,
-- and existing employees.salary_structure_id values keep resolving unchanged) → set
-- NOT NULL. The index is generated as-is.
--
-- Invariant guard: any INSERT that omits family_id (raw SQL, seeds, tests, or the
-- first version of a new family) auto-fills family_id = the row's own id via a
-- BEFORE INSERT trigger. Postgres column defaults can't reference another column, so a
-- trigger is the only way to keep `family_id = id` for origin versions without forcing
-- every caller to set it. Explicit family_id values (new FY versions) are left intact.

ALTER TABLE "salary_structures" ADD COLUMN "family_id" uuid;--> statement-breakpoint
UPDATE "salary_structures" SET "family_id" = "id" WHERE "family_id" IS NULL;--> statement-breakpoint
ALTER TABLE "salary_structures" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_structures_family_effective_idx" ON "salary_structures" USING btree ("org_id","family_id","effective_from");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "salary_structures_default_family_id"() RETURNS trigger AS $$
BEGIN
  IF NEW."family_id" IS NULL THEN
    NEW."family_id" := NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS "salary_structures_family_id_default" ON "salary_structures";--> statement-breakpoint
CREATE TRIGGER "salary_structures_family_id_default"
  BEFORE INSERT ON "salary_structures"
  FOR EACH ROW
  EXECUTE FUNCTION "salary_structures_default_family_id"();
