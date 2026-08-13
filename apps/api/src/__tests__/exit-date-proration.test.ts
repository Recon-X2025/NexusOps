/**
 * EXIT-DATE — pro-rate salary by days employed, both directions; a leaver is paid for
 * days worked (not zero, not excluded); no double-count with LOP.
 * ─────────────────────────────────────────────────────────────────────────────
 * Defect: earned components pro-rated only on attendance LOP, never on the employment
 * span. A mid-month JOINER with no attendance row was paid a full month (the `: 1`
 * short-circuit in computeGross ignored `daysWorked` when `lopDays === 0`); a LEAVER was
 * dropped from the run entirely (no `endDate`, so the selection could not tell a this-
 * period leaver from one who left long ago) and paid nothing for days actually worked.
 *
 * Fix: `daysEmployed` = calendar days of the period the employee was employed
 * (max(periodStart,startDate) … min(periodEnd, endDate)); `paidDays = daysEmployed − lopDays`;
 * factor = paidDays / daysInMonth. LOP is SUBTRACTED from employed days (additive, one
 * reduction), never a second multiplicative fraction. Leavers with an `endDate` in/after
 * the period are selected and pro-rated.
 *
 * NOTE on TDS: TDS is NOT expected to drop proportionally in the joining month — it
 * follows the ANNUAL s.192 projection (contracted × employment span, spread over the
 * remaining months), which the F9 fix already made join-aware. Do not "fix" it to track a
 * single partial month; that would be wrong. These tests assert the EARNED components and
 * PF/ESI/PT, which DO follow the pro-rated pay.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
// helpers imports the full appRouter (../routers) — keep it FIRST so the router graph
// evaluates in the correct order before `hrRouter` is pulled in on its own.
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { hrRouter } from "../routers/hr";
import { buildEmployeePayrollInput, computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import { employees, salaryStructures, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2026;
const MONTH = 4; // April — 30 calendar days
const FY_MONTH = 1; // April = FY month 1
const DAYS = 30;
const GROSS_MONTHLY = 100_000; // ₹1,00,000/mo (basic 40k, hra 20k, special 40k)

describe("EXIT-DATE: pro-rate by days employed, both directions", () => {
  let orgId: string;
  beforeEach(async () => { ({ orgId } = await seedTestOrg()); });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function seedEmp(
    over: Partial<typeof employees.$inferInsert> = {},
    ctcAnnual = 1_200_000,
  ): Promise<{ emp: typeof employees.$inferSelect; struct: typeof salaryStructures.$inferSelect }> {
    const { userId } = await seedUser(orgId, { email: `exit-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb().insert(salaryStructures).values({
      orgId, structureName: "Std", ctcAnnual: String(ctcAnnual),
      basicPercent: "40", hraPercentOfBasic: "50", effectiveFrom: new Date("2015-01-01"),
    }).returning();
    const [emp] = await testDb().insert(employees).values({
      orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: struct!.id,
      startDate: new Date("2020-01-01"), status: "active", state: "Karnataka", ...over,
    }).returning();
    return { emp: emp!, struct: struct! };
  }

  const grossOf = (emp: typeof employees.$inferSelect, struct: typeof salaryStructures.$inferSelect,
    attendance?: { daysInMonth: number; daysWorked: number; lopDays: number }) =>
    computeEmployeePayslip(buildEmployeePayrollInput(emp, struct, MONTH, YEAR, attendance), FY_MONTH).grossEarnings;

  // TEST 6 — regression guard FIRST: a full-period employee is byte-identical (full gross).
  it("full-period employee is unchanged (₹1,00,000)", async () => {
    const { emp, struct } = await seedEmp(); // joined 2020, no endDate
    expect(grossOf(emp, struct)).toBe(GROSS_MONTHLY);
  });

  // TEST 2 — joiner mid-period paid for days worked, not a full month.
  it("joiner on the 10th is paid 21/30 (₹70,000), not a full month — ₹30,000 was overpaid", async () => {
    const { emp, struct } = await seedEmp({ startDate: new Date("2026-04-10") });
    const gross = grossOf(emp, struct); // daysEmployed = Apr 10–30 = 21
    expect(gross).toBe(70_000);
    expect(GROSS_MONTHLY - gross).toBe(30_000); // the amount a full-month run overpaid
  });

  // TEST 1 — leaver mid-period paid for days worked, not zero, AND selected into the run.
  it("leaver on the 20th is paid 20/30 (₹66,667) and appears in the run", async () => {
    const { emp, struct } = await seedEmp({ status: "offboarded", endDate: new Date("2026-04-20") });
    // Paid for days worked (Apr 1–20 = 20 days), not zero:
    expect(grossOf(emp, struct)).toBe(66_667);
    // And no longer dropped from the run — the preview selects + pays them:
    const totals = await computePayrollRunTotals(testDb(), orgId, MONTH, YEAR);
    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBe(66_667);
  });

  // TEST 3 — join and leave within the same period → paid for the days between.
  it("join on the 10th and leave on the 20th → paid 11/30 (₹36,667)", async () => {
    const { emp, struct } = await seedEmp({
      startDate: new Date("2026-04-10"), status: "offboarded", endDate: new Date("2026-04-20"),
    });
    expect(grossOf(emp, struct)).toBe(36_667); // Apr 10–20 inclusive = 11 days
  });

  // TEST 4 — pro-ration composed with LOP does NOT double-count (the trap).
  it("joined on the 10th with 2 unpaid days → paid (21−2)/30 (₹63,333), not the double-counted ₹65,333", async () => {
    const { emp, struct } = await seedEmp({ startDate: new Date("2026-04-10") });
    const gross = grossOf(emp, struct, { daysInMonth: DAYS, daysWorked: DAYS - 2, lopDays: 2 });
    expect(gross).toBe(63_333); // (daysEmployed 21 − lopDays 2) / 30
    // The wrong multiplicative composition (21/30 × 28/30) would over-reduce to ~₹65,333.
    expect(gross).not.toBe(65_333);
  });

  // TEST 5 — statutory deductions follow the PRO-RATED earnings, not the full month.
  // Sub-cap basic (₹12,000/mo < ₹15,000 PF ceiling) so the proration is visible in PF.
  it("PF follows pro-rated earned basic (₹1,008 at 21/30), not the full-month ₹1,440", async () => {
    const { emp, struct } = await seedEmp({ startDate: new Date("2026-04-10") }, 360_000); // basic ₹12,000/mo
    const slip = computeEmployeePayslip(buildEmployeePayrollInput(emp, struct, MONTH, YEAR), FY_MONTH);
    // earned basic = 12,000 × 21/30 = 8,400 ⇒ PF 12% = 1,008. Full month would be 12% × 12,000 = 1,440.
    expect(slip.employeePF).toBe(1_008);
  });

  // TEST 7 — offboarding without a last working day is rejected AT THE PROCEDURE (not just the form).
  it("createOffboarding rejects a missing/blank last working day", async () => {
    const { userId } = await seedUser(orgId, { email: `off-${nanoid(6)}@qa.coheronconnect.io` });
    const { emp } = await seedEmp();
    const caller = hrRouter.createCaller(createMockContext(userId, orgId));
    // @ts-expect-error — endDate is now required; omitting it must be a validation error.
    await expect(caller.offboarding.createOffboarding({ employeeId: emp.id, name: "X", status: "completed" }))
      .rejects.toThrow();
    // A valid last working day writes employees.endDate.
    await caller.offboarding.createOffboarding({ employeeId: emp.id, name: "X", endDate: "2026-04-20", status: "completed" });
    const [row] = await testDb().select().from(employees).where(eq(employees.id, emp.id));
    expect(row!.endDate).not.toBeNull();
  });
});
