/**
 * C1 second half — declaration capture mutation, entity-type/identifier validation, the leave.update
 * date-order guard, and the opt-in starter salary structures.
 *
 * The declaration→run rupee-difference and lapsed→zero behaviours are covered in c1-core.test.ts via a
 * direct insert; here we prove the FORM's mutation path (`payroll.taxDeclarations.upsert`) end-to-end.
 */
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { hrRouter } from "../routers/hr";
import { indiaSchema } from "../routers/onboarding";
import { salaryStructures, employees, payrollRuns, payslips, taxDeclarations, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

// A minimally-valid india payload; each test overrides the entity fields under test.
const baseIndia = { pan: "ABCDE1234F", tan: "BLRE12345A", stateCode: "KA" };

describe("C1: entity-type → registration identifier validation", () => {
  it("requires a CIN for a company and rejects an LLPIN on it", () => {
    const ok = indiaSchema.safeParse({ ...baseIndia, entityType: "private_limited", cin: "U74999KA2020PTC123456" });
    expect(ok.success).toBe(true);

    const missingCin = indiaSchema.safeParse({ ...baseIndia, entityType: "private_limited" });
    expect(missingCin.success).toBe(false);

    const llpinOnCompany = indiaSchema.safeParse({ ...baseIndia, entityType: "private_limited", cin: "U74999KA2020PTC123456", llpin: "AAB1234" });
    expect(llpinOnCompany.success).toBe(false);
  });

  it("requires an LLPIN for an LLP and rejects a CIN on it", () => {
    const ok = indiaSchema.safeParse({ ...baseIndia, entityType: "llp", llpin: "AAB1234" });
    expect(ok.success).toBe(true);

    const missingLlpin = indiaSchema.safeParse({ ...baseIndia, entityType: "llp" });
    expect(missingLlpin.success).toBe(false);

    const cinOnLlp = indiaSchema.safeParse({ ...baseIndia, entityType: "llp", cin: "U74999KA2020PTC123456" });
    expect(cinOnLlp.success).toBe(false);
  });

  it("demands neither identifier of a proprietorship (and rejects one if supplied)", () => {
    const ok = indiaSchema.safeParse({ ...baseIndia, entityType: "sole_proprietorship" });
    expect(ok.success).toBe(true);

    const withCin = indiaSchema.safeParse({ ...baseIndia, entityType: "sole_proprietorship", cin: "U74999KA2020PTC123456" });
    expect(withCin.success).toBe(false);
  });

  it("does not require a 21-char CIN of everyone (the old exclusion): no entity type ⇒ no identifier rule", () => {
    const ok = indiaSchema.safeParse({ ...baseIndia });
    expect(ok.success).toBe(true);
  });
});

describe("C1: leave.update date-order guard", () => {
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hr: any;
  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    hr = hrRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("rejects a reversed-range edit (end before start)", async () => {
    await expect(
      hr.leave.update({ id: crypto.randomUUID(), startDate: "2026-08-11", endDate: "2026-08-09" }),
    ).rejects.toThrow(/on or after the start date/i);
  });

  it("lets a forward range through the guard (fails later on NOT_FOUND, proving the guard passed)", async () => {
    await expect(
      hr.leave.update({ id: crypto.randomUUID(), startDate: "2026-08-09", endDate: "2026-08-11" }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });
});

describe("C1: taxDeclarations.upsert (the form path)", () => {
  const M = 4, Y = 2026;
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any, empId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    payroll = payrollRouter.createCaller(createMockContext(adminId, orgId));
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `C1H-${nanoid(4)}`, ctcAnnual: "1200000", basicPercent: "50", daPercent: "0", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const { userId } = await seedUser(orgId, { email: `c1h-${nanoid(6)}@qa.coheronconnect.io` });
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: st!.id, startDate: new Date("2018-01-01"), status: "active", state: "Karnataka", city: "Bangalore", taxRegime: "old" })
      .returning();
    empId = e!.id;
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function runTds(): Promise<number> {
    const [r] = await testDb().insert(payrollRuns).values({ orgId, month: M, year: Y, status: "draft", pipelineStatus: "TDS_COMPUTED" }).returning();
    await payroll.runs.computePayslips({ runId: r!.id });
    const [slip] = await testDb().select().from(payslips).where(and(eq(payslips.payrollRunId, r!.id), eq(payslips.employeeId, empId)));
    await testDb().delete(payslips).where(eq(payslips.payrollRunId, r!.id));
    await testDb().delete(payrollRuns).where(eq(payrollRuns.id, r!.id));
    return Number(slip!.tds || 0);
  }

  it("writes provenance=provisional and is idempotent on (employee, fiscalYear)", async () => {
    const created = await payroll.taxDeclarations.upsert({ employeeId: empId, fiscalYear: Y, section80C: 50000 });
    expect(created.provenance).toBe("provisional");
    expect(Number(created.section80C)).toBe(50000);

    // Second upsert updates the SAME row (unique key), does not create a duplicate.
    const updated = await payroll.taxDeclarations.upsert({ employeeId: empId, fiscalYear: Y, section80C: 150000 });
    expect(updated.id).toBe(created.id);
    expect(Number(updated.section80C)).toBe(150000);

    const rows = await testDb().select().from(taxDeclarations).where(and(eq(taxDeclarations.employeeId, empId), eq(taxDeclarations.fiscalYear, Y)));
    expect(rows).toHaveLength(1);
  });

  it("a declaration captured through the mutation reduces the run's old-regime TDS (rupee difference)", async () => {
    const tdsBefore = await runTds();
    expect(tdsBefore).toBeGreaterThan(0);
    await payroll.taxDeclarations.upsert({ employeeId: empId, fiscalYear: Y, section80C: 150000 });
    const tdsAfter = await runTds();
    expect(tdsAfter).toBeLessThan(tdsBefore);
    expect(tdsBefore - tdsAfter).toBeGreaterThan(100);
  });
});

describe("C1: opt-in starter salary structures pass the server composition validator", () => {
  let orgId: string, adminId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payroll: any;
  // Mirrors STARTER_STRUCTURES in apps/web (Basic derived as 50 − DA).
  const STARTERS = [
    { name: "Services / IT", da: 0, hra: 50 },
    { name: "Manufacturing", da: 10, hra: 40 },
    { name: "Retail / Hospitality", da: 0, hra: 40 },
    { name: "Sales", da: 0, hra: 50 },
  ];
  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    payroll = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("each starter satisfies Basic % + DA % = 50 and upserts cleanly", async () => {
    for (const s of STARTERS) {
      const created = await payroll.salaryStructures.upsert({
        structureName: `${s.name} ${nanoid(4)}`,
        ctcAnnual: 900000,
        basicPercent: 50 - s.da,
        daPercent: s.da,
        hraPercentOfBasic: s.hra,
        effectiveFrom: new Date("2026-04-01"),
      });
      expect(created).toBeTruthy();
      expect(Number(created.basicPercent) + Number(created.daPercent)).toBeCloseTo(50, 5);
    }
  });
});
