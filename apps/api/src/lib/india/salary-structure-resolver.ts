/**
 * Salary-structure family resolver (M-05 versioning).
 * ───────────────────────────────────────────────────
 * Salary structures are effective-dated per financial year: every version of one
 * logical structure shares a `familyId`, and only one version is live at a time
 * (creating a new version auto-closes the previous — see `salaryStructuresRouter`).
 * Employees link to the FAMILY (`employees.salaryStructureId` holds a familyId), so a
 * payroll run for any period must resolve the version whose effective window contains
 * that period — NOT the current version. Re-running a past period therefore reproduces
 * what was in force then (Form-16, statutory returns), instead of retroactively
 * rewriting it with today's structure. This is the exact defect M-05 closes.
 *
 * Selection rule (mirrors resolveStatutoryCeilings):
 *   familyId = family AND effectiveFrom <= period AND (effectiveTo IS NULL OR period < effectiveTo)
 * If the windows ever overlap (they must not), the latest `effectiveFrom` wins.
 *
 * The `familyId` argument accepts either a real familyId or a legacy version id: for
 * single-version families created before 0065 the two are equal (backfilled
 * family_id = id), so passing `employees.salaryStructureId` resolves correctly in both
 * the pre- and post-versioning world.
 */
import {
  salaryStructures,
  eq,
  and,
  lte,
  gt,
  isNull,
  or,
  desc,
  type DbOrTx,
} from "@coheronconnect/db";

export type SalaryStructureRow = typeof salaryStructures.$inferSelect;

/**
 * Resolve the salary-structure version in force for `orgId` / `familyId` at `period`.
 * Returns `null` when the family has no version covering the period.
 */
export async function resolveSalaryStructureForPeriod(
  db: DbOrTx,
  orgId: string,
  familyId: string,
  period: Date,
): Promise<SalaryStructureRow | null> {
  const [row] = await db
    .select()
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.orgId, orgId),
        eq(salaryStructures.familyId, familyId),
        lte(salaryStructures.effectiveFrom, period),
        or(
          isNull(salaryStructures.effectiveTo),
          gt(salaryStructures.effectiveTo, period),
        ),
      ),
    )
    // Latest effective start wins if two windows ever overlap (defensive; the
    // auto-close on create prevents overlap in normal operation).
    .orderBy(desc(salaryStructures.effectiveFrom))
    .limit(1);
  return row ?? null;
}
