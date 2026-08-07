/**
 * ESI membership persistence + carry through the payroll run (C3).
 *
 * The run assesses membership at a period boundary (1 Apr / 1 Oct) from that
 * month's gross and stores it on the employee; mid-period months in the same
 * period carry it without re-assessing. This drives the real `computePayslips`
 * path and asserts the stored state.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { salaryStructures, employees, payrollRuns, payslips, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("ESI membership persisted + carried by the run (C3)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;
  let empId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedEmp(ctcAnnual: string) {
    const db = testDb();
    const [s] = await db
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual, basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const [e] = await db
      .insert(employees)
      .values({
        orgId, userId: adminId, employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: s!.id, startDate: new Date("2020-01-01"), status: "active", state: "Maharashtra",
      })
      .returning();
    empId = e!.id;
  }

  async function runMonth(month: number, year: number) {
    const db = testDb();
    const [run] = await db
      .insert(payrollRuns)
      .values({ orgId, month, year, status: "draft", pipelineStatus: "TDS_COMPUTED" })
      .returning();
    await caller.runs.computePayslips({ runId: run!.id });
    return run!.id;
  }

  async function emp() {
    const [row] = await testDb().select().from(employees).where(eq(employees.id, empId));
    return row!;
  }

  it("an April run makes a ₹21k-or-under employee a member and stamps the period", async () => {
    await seedEmp("240000"); // gross ₹20,000 ≤ ceiling
    const runId = await runMonth(4, 2026);
    const e = await emp();
    expect(e.esiMember).toBe(true);
    expect(new Date(e.esiMemberPeriodStart!)).toEqual(new Date(2026, 3, 1)); // 1 April
    const [p] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    expect(Number(p!.esiEmployee)).toBeGreaterThan(0);
  });

  it("an above-ceiling employee is not a member and contributes ₹0", async () => {
    await seedEmp("600000"); // gross ₹50,000 > ceiling
    const runId = await runMonth(4, 2026);
    const e = await emp();
    expect(e.esiMember).toBe(false);
    const [p] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, runId), eq(payslips.employeeId, empId)));
    expect(Number(p!.esiEmployee)).toBe(0);
  });

  it("membership stamped in April is NOT re-stamped by a June run (same period holds)", async () => {
    await seedEmp("240000");
    await runMonth(4, 2026);
    await runMonth(6, 2026); // June — same Apr–Sep period
    const e = await emp();
    expect(e.esiMember).toBe(true);
    expect(new Date(e.esiMemberPeriodStart!)).toEqual(new Date(2026, 3, 1)); // still 1 April
  });

  it("an October run re-assesses for the new Oct–Mar period", async () => {
    await seedEmp("240000");
    await runMonth(4, 2026);
    await runMonth(10, 2026);
    const e = await emp();
    expect(new Date(e.esiMemberPeriodStart!)).toEqual(new Date(2026, 9, 1)); // advanced to 1 October
  });

  it("a mid-period ENTRY (non-member drops to/under the ceiling) is persisted that month", async () => {
    await seedEmp("240000"); // pay scale ₹20k ≤ ceiling → eligible
    // Pre-set them as a NON-member for the current (April) period, as if a prior boundary excluded them.
    await testDb()
      .update(employees)
      .set({ esiMember: false, esiMemberPeriodStart: new Date(2026, 3, 1) })
      .where(eq(employees.id, empId));
    // A June run assesses entry monthly → they join in June, and it must stick.
    await runMonth(6, 2026);
    const e = await emp();
    expect(e.esiMember).toBe(true); // joined mid-period
    expect(new Date(e.esiMemberPeriodStart!)).toEqual(new Date(2026, 3, 1)); // same period → retention now applies
  });
});
