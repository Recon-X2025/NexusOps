/**
 * C2-STRUCT — half-yearly PT through the RUN path (payroll-run-aggregates).
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves the wiring the pure-engine suite (packages/payroll-math/src/pt-half-yearly.test.ts)
 * cannot: that `computePayrollRunTotals` derives a half-yearly state's period income from
 * PAYSLIP HISTORY (establish-question (a): no new accumulator table needed), deducts the
 * six-month lump in the collection month when the period is complete, and — the critical
 * requirement — raises a per-employee WARNING (never a silently-small deduction) when the
 * prior-period payroll is missing, as it is on a migrated employer's first in-system run.
 *
 * Tamil Nadu collects H1 (Apr–Sep) in September (FY month 6) by the current CA-pending default.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures, payrollRuns, payslips } from "@coheronconnect/db";
import { nanoid } from "nanoid";

// Structure gives a clean ₹65,000/month gross: basic 26,000 + hra 13,000 + special 26,000.
const CTC = "780000";
const MONTHLY_GROSS = 65_000;

describe("half-yearly PT via computePayrollRunTotals (Tamil Nadu)", () => {
  let orgId: string;

  async function seedTnEmployee(): Promise<string> {
    const { userId } = await seedUser(orgId, { email: `tn-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: CTC,
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Tamil Nadu",
      })
      .returning();
    return emp!.id;
  }

  /** Seed a locked payslip for one prior month, creating the owning payroll_run. */
  async function seedPriorPayslip(employeeId: string, calMonth: number, calYear: number, gross: number) {
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({ orgId, month: calMonth, year: calYear })
      .returning();
    await testDb().insert(payslips).values({
      orgId,
      employeeId,
      payrollRunId: run!.id,
      month: calMonth,
      year: calYear,
      grossEarnings: String(gross),
    });
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("complete period: deducts the six-month lump in September, no warning", async () => {
    const empId = await seedTnEmployee();
    // Apr–Aug 2026 on record (FY months 1–5), each ₹65,000.
    for (const m of [4, 5, 6, 7, 8]) await seedPriorPayslip(empId, m, 2026, MONTHLY_GROSS);

    // Run September 2026 (the collection month). Half-yearly income = 6 × 65,000 = 390,000
    // → Tamil Nadu top band (> ₹75,000) → ₹1,250 lump.
    const totals = await computePayrollRunTotals(testDb(), orgId, 9, 2026);

    expect(totals.totalPt).toBe(1_250);
    expect(totals.errors.filter((e) => /half-yearly professional tax/i.test(e.message))).toHaveLength(0);
  });

  it("incomplete period — DATA cause (migration): warns naming the missing month, deducts ₹0", async () => {
    const empId = await seedTnEmployee();
    // Only Apr–Jul on record; August (FY month 5) is missing — the migration gap.
    for (const m of [4, 5, 6, 7]) await seedPriorPayslip(empId, m, 2026, MONTHLY_GROSS);

    const totals = await computePayrollRunTotals(testDb(), orgId, 9, 2026);

    // No lump deducted — nothing is filed from partial data.
    expect(totals.totalPt).toBe(0);
    // A per-employee warning surfaces, naming the absent month and reading as a data cause.
    const warn = totals.errors.find((e) => /half-yearly professional tax/i.test(e.message));
    expect(warn).toBeTruthy();
    expect(warn!.employeeId).toBe(empId);
    expect(warn!.message).toMatch(/August/);
    expect(warn!.message).toMatch(/data\/migration gap/i);
  });

  it("incomplete period — TIMING cause (H2 collected in Feb, before Mar): warns naming March, deducts ₹0", async () => {
    // FY 2026-27 H2 = Oct 2026 – Mar 2027, collected in February (FY month 11) by the default.
    // Even with the whole Oct–Jan history present, March has not elapsed, so the six-month
    // income is unknown → flag on timing, deduct ₹0. This is the silent-under-collection the
    // correction closes: five months (Oct–Feb) would land in a lower bracket than Oct–Mar.
    const empId = await seedTnEmployee();
    await seedPriorPayslip(empId, 10, 2026, MONTHLY_GROSS); // Oct
    await seedPriorPayslip(empId, 11, 2026, MONTHLY_GROSS); // Nov
    await seedPriorPayslip(empId, 12, 2026, MONTHLY_GROSS); // Dec
    await seedPriorPayslip(empId, 1, 2027, MONTHLY_GROSS); // Jan

    const totals = await computePayrollRunTotals(testDb(), orgId, 2, 2027); // February 2027

    expect(totals.totalPt).toBe(0);
    const warn = totals.errors.find((e) => /half-yearly professional tax/i.test(e.message));
    expect(warn).toBeTruthy();
    expect(warn!.employeeId).toBe(empId);
    expect(warn!.message).toMatch(/March/);
    expect(warn!.message).toMatch(/timing issue/i);
  });

  it("non-collection month: no lump, no warning (nothing due in, e.g., May)", async () => {
    const empId = await seedTnEmployee();
    for (const m of [4]) await seedPriorPayslip(empId, m, 2026, MONTHLY_GROSS);

    const totals = await computePayrollRunTotals(testDb(), orgId, 5, 2026); // May
    expect(totals.totalPt).toBe(0);
    expect(totals.errors.filter((e) => /half-yearly professional tax/i.test(e.message))).toHaveLength(0);
  });
});
