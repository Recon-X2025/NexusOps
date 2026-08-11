/**
 * M-05 — Salary-structure family versioning (effective-dated).
 * ───────────────────────────────────────────────────────────
 * Labour Codes raised the basic+DA wage base to 50% of total remuneration, so every
 * structure must be restructured on a financial-year boundary. Without versioning,
 * editing a structure would retroactively rewrite what past payslips were computed from
 * (PF/ESI/gratuity would shift behind filed returns). The fix: a structure is a FAMILY
 * of effective-dated versions (shared `familyId`); only one is live at a time; employees
 * link to the FAMILY; payroll resolves the version whose window contains the pay period.
 *
 * The defect this closes: a payroll run (or re-run) for a PAST period must resolve the
 * version in force THEN, not the current version. These tests assert exactly that, plus
 * the two guardrails — an edit is refused once payslips exist against a version, and a
 * superseded version stays readable.
 *
 * RED before the fix: `resolveSalaryStructureForPeriod` + the `familyId` column don't
 * exist, and `upsert` freely overwrote any version. GREEN after: past periods resolve
 * the old version, edits with payslips are refused, superseded versions remain readable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { resolveSalaryStructureForPeriod } from "../lib/india/salary-structure-resolver";
import { employees, salaryStructures, payrollRuns, payslips, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

// FY 2025-26 version (₹40% basic) superseded by an FY 2026-27 version (₹50% basic,
// the Labour-Codes restructuring). The boundary is 1 April 2026.
const FY25_FROM = new Date("2025-04-01T00:00:00Z");
const FY26_FROM = new Date("2026-04-01T00:00:00Z");

describe("M-05: salary-structure family versioning", () => {
  let caller: ReturnType<typeof payrollRouter.createCaller>;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /**
   * Seed a two-version family: v1 (FY25, basic 40%) auto-closed at 1 Apr 2026, and
   * v2 (FY26, basic 50%) open-ended. Returns both rows and the familyId.
   */
  async function seedFamily() {
    const db = testDb();
    // v1 — origin version: the trigger sets family_id = id.
    const [v1] = await db
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: `Std-${nanoid(4)}`,
        ctcAnnual: "1200000",
        basicPercent: "40",
        effectiveFrom: FY25_FROM,
        effectiveTo: FY26_FROM, // auto-closed at the FY26 boundary
      })
      .returning();
    const familyId = v1!.familyId;
    // v2 — new FY version, same family, basic bumped to 50% (Labour Codes).
    const [v2] = await db
      .insert(salaryStructures)
      .values({
        orgId,
        familyId,
        structureName: v1!.structureName,
        ctcAnnual: "1200000",
        basicPercent: "50",
        effectiveFrom: FY26_FROM,
        effectiveTo: null,
      })
      .returning();
    return { v1: v1!, v2: v2!, familyId };
  }

  it("origin version's familyId equals its own id (trigger backfill)", async () => {
    const { v1 } = await seedFamily();
    expect(v1.familyId).toBe(v1.id);
  });

  it("resolves the PAST-period version, not the current one (the core defect)", async () => {
    const { v1, v2, familyId } = await seedFamily();
    const db = testDb();

    // A pay period inside FY 2025-26 must resolve v1 (basic 40%), NOT the current v2.
    const past = await resolveSalaryStructureForPeriod(db, orgId, familyId, new Date("2025-08-01"));
    expect(past?.id).toBe(v1.id);
    expect(past?.basicPercent).toBe("40.00");

    // A pay period inside FY 2026-27 resolves v2 (basic 50%).
    const current = await resolveSalaryStructureForPeriod(db, orgId, familyId, new Date("2026-08-01"));
    expect(current?.id).toBe(v2.id);
    expect(current?.basicPercent).toBe("50.00");
  });

  it("resolves exactly one version at the boundary instant (no overlap)", async () => {
    const { v1, v2, familyId } = await seedFamily();
    const db = testDb();
    // At 1 Apr 2026 00:00 the window is half-open: v1 ends (effectiveTo exclusive), v2
    // begins (effectiveFrom inclusive) — so the boundary resolves to v2, never both.
    const atBoundary = await resolveSalaryStructureForPeriod(db, orgId, familyId, FY26_FROM);
    expect(atBoundary?.id).toBe(v2.id);
    // The instant before the boundary still resolves v1.
    const justBefore = await resolveSalaryStructureForPeriod(
      db,
      orgId,
      familyId,
      new Date("2026-03-31T23:59:59Z"),
    );
    expect(justBefore?.id).toBe(v1.id);
  });

  it("newVersion auto-closes the prior version so two are never live at once", async () => {
    const db = testDb();
    // Create a single-version family via the router, then add an FY version.
    const created = await caller.salaryStructures.upsert({
      structureName: `Auto-${nanoid(4)}`,
      ctcAnnual: 1_200_000,
      basicPercent: 50, // Basic + DA = 50 (composition guard); this test is about versioning, not composition.
      effectiveFrom: FY25_FROM,
    });
    expect(created.familyId).toBe(created.id); // origin

    await caller.salaryStructures.newVersion({
      familyId: created.familyId,
      structureName: created.structureName,
      ctcAnnual: 1_200_000,
      basicPercent: 50,
      effectiveFrom: FY26_FROM,
    });

    const versions = await db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.familyId, created.familyId));
    // Exactly one open (effectiveTo IS NULL) version — the prior was auto-closed.
    const open = versions.filter((v) => v.effectiveTo === null);
    expect(open).toHaveLength(1);
    expect(open[0]!.basicPercent).toBe("50.00");
    // The prior version was closed exactly at the new one's start.
    const closed = versions.find((v) => v.effectiveTo !== null);
    expect(closed!.effectiveTo!.getTime()).toBe(FY26_FROM.getTime());
  });

  it("refuses to edit a version once payslips have been computed from it", async () => {
    const { v1, familyId } = await seedFamily();
    const db = testDb();

    // Assign an employee to the FAMILY and give them an FY25 payslip (in v1's window).
    const [emp] = await db
      .insert(employees)
      .values({
        orgId,
        userId: adminId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: familyId, // link to the family
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    const [run] = await db
      .insert(payrollRuns)
      .values({ orgId, month: 8, year: 2025, status: "draft" })
      .returning();
    await db.insert(payslips).values({
      orgId,
      employeeId: emp!.id,
      payrollRunId: run!.id,
      month: 8,
      year: 2025, // inside v1's FY25 window
      grossEarnings: "100000",
      netPay: "90000",
    });

    // Editing v1 must be refused, naming arrears as the route.
    await expect(
      caller.salaryStructures.upsert({
        id: v1.id,
        structureName: v1.structureName,
        ctcAnnual: 1_500_000,
        basicPercent: 50, // valid composition, so the refusal comes from the payslip guard (the test's point), not the 50-guard
        effectiveFrom: FY25_FROM,
      }),
    ).rejects.toThrow(/payslips|arrears/i);
  });

  it("allows editing a version that has no payslips", async () => {
    const { v2, familyId } = await seedFamily();
    // v2 (FY26) has no payslips → editable.
    const updated = await caller.salaryStructures.upsert({
      id: v2.id,
      structureName: v2.structureName,
      ctcAnnual: 1_800_000,
      basicPercent: 50,
      effectiveFrom: FY26_FROM,
    });
    expect(updated.ctcAnnual).toBe("1800000.00");
    expect(updated.familyId).toBe(familyId); // family preserved
  });

  it("keeps a superseded version readable via listVersions", async () => {
    const { v1, v2, familyId } = await seedFamily();
    const versions = await caller.salaryStructures.listVersions({ familyId });
    const ids = versions.map((v) => v.id);
    // Both the superseded v1 and the current v2 are returned (immutable history).
    expect(ids).toContain(v1.id);
    expect(ids).toContain(v2.id);
    // Newest window first.
    expect(versions[0]!.id).toBe(v2.id);
  });

  it("list shows one row per family (the current version), not superseded ones", async () => {
    const { v2, familyId } = await seedFamily();
    const rows = await caller.salaryStructures.list();
    const forFamily = rows.filter((r) => r.familyId === familyId);
    // Exactly one selectable entry per family, and it is the current (FY26) version.
    expect(forFamily).toHaveLength(1);
    expect(forFamily[0]!.id).toBe(v2.id);
  });
});
