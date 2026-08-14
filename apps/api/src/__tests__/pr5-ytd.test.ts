/**
 * PR5 — year-to-date on the payslip is the running fiscal-year total, not one month.
 * ─────────────────────────────────────────────────────────────────────────────
 * The run passed `ytd*=0` into the engine (`payroll-run-aggregates.ts` buildEmployeePayrollInput),
 * so the engine's `ytd = 0 + thisMonth` stored EACH payslip's YTD as that ONE month — visibly wrong
 * on a September payslip (YTD PF ₹0 / YTD Net one month). The fix sums each employee's EARLIER
 * fiscal-year payslips (buildYtdContext) and feeds them as the running base; the engine adds the
 * current month. FY runs April→March.
 *
 * These drive the REAL write path (`runs.computePayslips`) and assert the STORED `ytd_*` columns —
 * the exact fields `buildPayslipView` reads (payslip-view.ts:219-222), i.e. what the document renders.
 * Where the monthly figure is deterministic (gross ₹50,000, employee PF ₹1,800) it is asserted in
 * rupees; the running total is also tied to the stored per-month actuals so TDS need not be hardcoded.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("PR5: payslip YTD is the running fiscal-year total", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caller: any;
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  // ctc 600,000 → gross 50,000/mo (basic 20,000; PF on the ₹15,000 ceiling = 1,800/mo).
  async function seedEmp(opts: { code: string; startDate?: string; endDate?: string | null }): Promise<string> {
    const [s] = await testDb().insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: "600000", basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `ytd-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb().insert(employees)
      .values({
        orgId, userId, employeeId: opts.code, salaryStructureId: s!.id,
        startDate: new Date(opts.startDate ?? "2020-01-01"),
        endDate: opts.endDate ? new Date(opts.endDate) : null,
        status: "active", state: "Karnataka", taxRegime: "new",
      })
      .returning();
    return e!.id;
  }

  /** Run one month end-to-end (the write path stores the payslips). */
  async function runMonth(month: number, year: number) {
    const [run] = await testDb().insert(payrollRuns)
      .values({ orgId, month, year, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await caller.runs.computePayslips({ runId: run!.id });
  }

  async function payslip(empId: string, month: number, year: number) {
    const [row] = await testDb().select().from(payslips)
      .where(and(eq(payslips.orgId, orgId), eq(payslips.employeeId, empId), eq(payslips.month, month), eq(payslips.year, year)));
    return row!;
  }

  // TEST 2 (first FY run = this month alone) + TEST 1 (second run = sum), all four figures in rupees.
  it("first FY run shows this month; the second shows the sum — gross/PF/TDS/net", async () => {
    const emp = await seedEmp({ code: "EMP-YTD" });
    await runMonth(4, 2026); // April — FY month 1
    await runMonth(5, 2026); // May   — FY month 2

    const apr = await payslip(emp, 4, 2026);
    const may = await payslip(emp, 5, 2026);

    // First run of the FY: YTD equals that month alone.
    expect(Number(apr.ytdGross)).toBe(Number(apr.grossEarnings));
    expect(Number(apr.ytdGross)).toBe(50000);
    expect(Number(apr.ytdPf)).toBe(Number(apr.pfEmployee));
    expect(Number(apr.ytdPf)).toBe(1800);
    expect(Number(apr.ytdTds)).toBe(Number(apr.tds));
    expect(Number(apr.ytdNet)).toBe(Number(apr.netPay));

    // Second run in the same FY: YTD equals the sum of both months, for all four.
    expect(Number(may.ytdGross)).toBe(Number(apr.grossEarnings) + Number(may.grossEarnings));
    expect(Number(may.ytdGross)).toBe(100000);
    expect(Number(may.ytdPf)).toBe(Number(apr.pfEmployee) + Number(may.pfEmployee));
    expect(Number(may.ytdPf)).toBe(3600);
    expect(Number(may.ytdTds)).toBe(Number(apr.tds) + Number(may.tds));
    expect(Number(may.ytdNet)).toBe(Number(apr.netPay) + Number(may.netPay));

    // TEST 6 — the document renders these exact stored columns (buildPayslipView, payslip-view.ts:219-222).
    expect(Number(may.ytdGross)).toBe(Number(apr.ytdGross) + Number(may.grossEarnings));
  });

  // TEST 3 — a run crossing the April boundary does not carry the prior fiscal year forward.
  it("does not carry the prior FY forward across the April boundary", async () => {
    const emp = await seedEmp({ code: "EMP-BND" });
    await runMonth(3, 2026); // March 2026 — FY 2025-26, month 12
    await runMonth(4, 2026); // April 2026 — FY 2026-27, month 1 (a new year)

    const apr = await payslip(emp, 4, 2026);
    // April is the FIRST month of the new FY — YTD is April alone, NOT March + April.
    expect(Number(apr.ytdGross)).toBe(Number(apr.grossEarnings));
    expect(Number(apr.ytdGross)).toBe(50000); // not 100,000
  });

  // TEST 4 — a mid-year joiner's YTD is their own months only; a veteran's still accumulates.
  it("a mid-year joiner shows their own figures only (per-employee isolation)", async () => {
    const vet = await seedEmp({ code: "EMP-VET" });                       // employed since 2020
    await runMonth(4, 2026);                                              // veteran: April
    const joiner = await seedEmp({ code: "EMP-NEW", startDate: "2026-07-01" }); // joins July
    await runMonth(7, 2026);                                              // both: July

    const vetJul = await payslip(vet, 7, 2026);
    const joinerJul = await payslip(joiner, 7, 2026);

    // The joiner has no earlier payslips → July alone.
    expect(Number(joinerJul.ytdGross)).toBe(Number(joinerJul.grossEarnings));
    expect(Number(joinerJul.ytdGross)).toBe(50000);
    // The veteran accumulates only the months actually run (April + July), not the joiner's.
    expect(Number(vetJul.ytdGross)).toBe(100000);
  });

  // TEST 5 — a leaver's final run (pro-rated by EXIT-DATE) accumulates correctly.
  it("accumulates a leaver's pro-rated final month", async () => {
    const emp = await seedEmp({ code: "EMP-LVR" });
    await runMonth(4, 2026); // full April
    await testDb().update(employees).set({ endDate: new Date("2026-05-15") }).where(eq(employees.id, emp)); // leaves mid-May
    await runMonth(5, 2026); // pro-rated May

    const apr = await payslip(emp, 4, 2026);
    const may = await payslip(emp, 5, 2026);
    expect(Number(may.grossEarnings)).toBeLessThan(50000);             // May is pro-rated to the 15th
    expect(Number(may.ytdGross)).toBe(Number(apr.grossEarnings) + Number(may.grossEarnings)); // running total holds
    expect(Number(may.ytdNet)).toBe(Number(apr.netPay) + Number(may.netPay));
  });
});
