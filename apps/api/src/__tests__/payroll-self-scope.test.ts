/**
 * BLOCKER regression: payroll read procedures must be self-service.
 *
 * `hr.payroll.{computeCurrentSlip,computeMonthlySlip,listPayslips,generateECR}`
 * all gated on `hr:read` — which the base `requester` role (every employee)
 * holds — and took an arbitrary `employeeId`, so any employee could read a
 * colleague's decrypted PAN, UAN and full salary, or dump the whole org's ECR.
 *
 * Fix: the per-employee reads route through `assertSelfOrHrWriter` (your own
 * record, or `hr:write` for anyone); `generateECR` (org-wide statutory export)
 * requires `hr:write`. These tests fail if any of that self-scope is removed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initTestEnvironment, testDb, seedTestOrg, seedUser, makeContext } from "./helpers";
import { hrRouter } from "../routers/hr";
import { employees, payslips, payrollRuns } from "@coheronconnect/db";
import { nanoid } from "nanoid";

/** A base-role employee: holds hr:read (every employee does), NOT hr:write. */
function requesterCtx(userId: string, orgId: string) {
  return makeContext(userId, orgId, {
    user: {
      id: userId,
      orgId,
      email: `req-${userId.slice(0, 8)}@qa.io`,
      name: "Requester",
      role: "member",
      matrixRole: "requester",
      status: "active",
    },
  });
}

const mkEmployee = async (orgId: string, userId: string) => {
  const db = testDb();
  const [emp] = await db
    .insert(employees)
    .values({ orgId, userId, employeeId: `EMP-${nanoid(6)}`, status: "active", startDate: new Date() })
    .returning();
  return emp!;
};

beforeAll(async () => {
  await initTestEnvironment();
});

describe("payroll read procedures self-scope (BLOCKER regression)", () => {
  it("a requester cannot read a colleague's slip/monthly-slip/payslips, but can read their own", async () => {
    const { orgId } = await seedTestOrg();
    const { userId: uA } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    const { userId: uB } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    const empA = await mkEmployee(orgId, uA);
    const empB = await mkEmployee(orgId, uB);

    const caller = hrRouter.createCaller(requesterCtx(uA, orgId));

    // Colleague B — every per-employee read must be FORBIDDEN.
    await expect(caller.payroll.computeCurrentSlip({ employeeId: empB.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.payroll.computeMonthlySlip({ employeeId: empB.id, month: 6, year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.payroll.listPayslips({ employeeId: empB.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Own record A — auth passes (no salary structure assigned → resolves null,
    // which proves the guard let it through rather than throwing FORBIDDEN).
    await expect(caller.payroll.computeCurrentSlip({ employeeId: empA.id })).resolves.toBeNull();
  });

  it("listPayslips with no id scopes a requester to their OWN payslips, not the whole org", async () => {
    const { orgId } = await seedTestOrg();
    const db = testDb();
    const { userId: uA } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    const { userId: uB } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    const empA = await mkEmployee(orgId, uA);
    const empB = await mkEmployee(orgId, uB);
    const [run] = await db.insert(payrollRuns).values({ orgId, month: 6, year: 2026 }).returning();
    await db.insert(payslips).values([
      { orgId, employeeId: empA.id, payrollRunId: run!.id, month: 6, year: 2026 },
      { orgId, employeeId: empB.id, payrollRunId: run!.id, month: 6, year: 2026 },
    ]);

    const rows = await hrRouter.createCaller(requesterCtx(uA, orgId)).payroll.listPayslips({});
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.employeeId === empA.id)).toBe(true);
    expect(rows.some((r) => r.employeeId === empB.id)).toBe(false);
  });

  it("generateECR requires hr:write — a requester is denied, an hr:write user passes the gate", async () => {
    const { orgId } = await seedTestOrg();
    const { userId: uReq } = await seedUser(orgId, { role: "member", matrixRole: "requester" });
    await expect(
      hrRouter.createCaller(requesterCtx(uReq, orgId)).payroll.generateECR({ month: 6, year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // An admin holds hr:write → passes the auth gate; with no payroll run for the
    // period it reaches the handler's NOT_FOUND (proving it got past the gate).
    const { userId: uAdmin } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    await expect(
      hrRouter.createCaller(makeContext(uAdmin, orgId)).payroll.generateECR({ month: 6, year: 2026 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
