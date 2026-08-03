/**
 * PR2 — YTD Net / YTD PF are read from persisted columns, not fabricated ×12.
 * ───────────────────────────────────────────────────────────────────────────
 * First-real-payroll-run finding: the payslip showed YTD Net (₹1.69cr) far above
 * YTD Gross (₹29.8L). Root cause: there was no `ytd_net`/`ytd_pf` column, so the
 * display layer faked both as (this month × 12). On any partial year that makes
 * YTD Net exceed YTD Gross.
 *
 * This test pins the fix: `payroll.payslips.myPayslips` must return the stored
 * `ytd_net` / `ytd_pf` columns verbatim, NOT `netPay × 12` / `pfEmployee × 12`.
 * It seeds a payslip whose stored YTD figures deliberately differ from ×12 so the
 * two behaviours are distinguishable:
 *   - stored ytd_net = netPay      (a first-month payslip: YTD == this month)
 *   - the old fabrication would be  netPay × 12  (12× larger) → RED.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import {
  employees,
  salaryStructures,
  payrollRuns,
  payslips,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2026;
const MONTH = 4; // April 2026 → FY 2026-27 month 1

describe("PR2: payslip YTD net/PF from persisted columns (no ×12)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;
  let empId: string;

  const NET_PAY = 100_000; // this month's net
  const PF_EMPLOYEE = 1_800; // this month's employee PF
  // Stored YTD == this month (a first-month payslip). The old ×12 fabrication
  // would have reported 12× these — the discriminating values.
  const STORED_YTD_NET = NET_PAY;
  const STORED_YTD_PF = PF_EMPLOYEE;
  const STORED_YTD_GROSS = 120_000;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));

    const db = testDb();
    const [s] = await db
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "1440000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();

    const [e] = await db
      .insert(employees)
      .values({
        orgId,
        userId: adminId, // myPayslips resolves the employee by ctx user
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    empId = e!.id;

    const [run] = await db
      .insert(payrollRuns)
      .values({
        orgId,
        month: MONTH,
        year: YEAR,
        status: "draft",
      })
      .returning();

    await db.insert(payslips).values({
      orgId,
      employeeId: empId,
      payrollRunId: run!.id,
      month: MONTH,
      year: YEAR,
      grossEarnings: "120000",
      pfEmployee: String(PF_EMPLOYEE),
      netPay: String(NET_PAY),
      ytdGross: String(STORED_YTD_GROSS),
      ytdTds: "0",
      ytdNet: String(STORED_YTD_NET),
      ytdPf: String(STORED_YTD_PF),
    });
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("returns stored ytd_net / ytd_pf, not netPay×12 / pf×12", async () => {
    const rows = await caller.payslips.myPayslips({ year: YEAR });
    expect(rows).toHaveLength(1);
    const p = rows[0]!;

    // The fix: YTD comes from the persisted columns.
    expect(p.ytdNetPay).toBe(STORED_YTD_NET);
    expect(p.ytdPF).toBe(STORED_YTD_PF);

    // Guard against the old fabrication explicitly.
    expect(p.ytdNetPay).not.toBe(NET_PAY * 12);
    expect(p.ytdPF).not.toBe(PF_EMPLOYEE * 12);

    // The core invariant the finding violated: YTD Net must not exceed YTD Gross.
    expect(p.ytdNetPay).toBeLessThanOrEqual(p.ytdGross);
  });
});
