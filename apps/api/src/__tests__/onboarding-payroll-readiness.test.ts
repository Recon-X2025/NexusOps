/**
 * Payroll-readiness signal on the derived onboarding checklist.
 * ─────────────────────────────────────────────────────────────────────────────
 * A finished setup wizard tells the customer "Setup complete", but an org with
 * no employees and no salary structures cannot run a single payroll. `getChecklist`
 * now returns a `payrollReadiness` block that names exactly what stands between the
 * org and its first run, and where to fix it.
 *
 * The conditions mirror the payroll run's OWN employee selection
 * (services/payroll-run-aggregates.ts): an employed employee needs a salary
 * structure (else excluded/unpaid) and a `state` (else buildEmployeePayrollInput
 * throws), and at least one salary structure must exist to assign. taxRegime is
 * NOT NULL DEFAULT 'new' in the schema, so it is never absent and is not a blocker.
 *
 * Real Postgres, fresh org per test, everything driven through the real router.
 */
import { describe, it, expect, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, createMockContext, testDb, cleanupOrg } from "./helpers";
import { onboardingRouter } from "../routers/onboarding";
import { employees, salaryStructures } from "@coheronconnect/db";

const createdOrgs: string[] = [];

async function freshOrg() {
  const { orgId } = await seedTestOrg();
  createdOrgs.push(orgId);
  const { userId } = await seedUser(orgId, { email: `admin-${nanoid(6)}@qa.coheronconnect.io` });
  const caller = onboardingRouter.createCaller(createMockContext(userId, orgId));
  return { orgId, userId, caller };
}

async function seedStructure(orgId: string): Promise<string> {
  const [struct] = await testDb()
    .insert(salaryStructures)
    .values({
      orgId,
      structureName: "Std",
      ctcAnnual: "780000",
      basicPercent: "40",
      effectiveFrom: new Date("2015-01-01"),
    })
    .returning();
  return struct!.id;
}

async function seedEmp(
  orgId: string,
  opts: { code: string; salaryStructureId?: string | null; state?: string | null },
): Promise<string> {
  const { userId } = await seedUser(orgId, { email: `emp-${nanoid(6)}@qa.coheronconnect.io` });
  const [emp] = await testDb()
    .insert(employees)
    .values({
      orgId,
      userId,
      employeeId: opts.code,
      salaryStructureId: opts.salaryStructureId ?? null,
      startDate: new Date("2020-01-01"),
      status: "active",
      // `state` omitted ⇒ NULL (the missing-state case).
      ...(opts.state !== undefined ? { state: opts.state } : {}),
    })
    .returning();
  return emp!.id;
}

afterEach(async () => {
  while (createdOrgs.length) await cleanupOrg(createdOrgs.pop()!);
});

describe("onboarding.getChecklist — payroll readiness", () => {
  it("an org with no employees and no structures is not ready, naming BOTH", async () => {
    const { caller } = await freshOrg();

    const { payrollReadiness } = await caller.getChecklist();

    expect(payrollReadiness.ready).toBe(false);
    const codes = payrollReadiness.blockers.map((b) => b.code);
    expect(codes).toContain("no_employees");
    expect(codes).toContain("no_structures");
    // Both name where to go.
    const structBlocker = payrollReadiness.blockers.find((b) => b.code === "no_structures");
    expect(structBlocker!.href).toBe("/app/payroll");
    expect(structBlocker!.message).toMatch(/salary structure/i);
  });

  it("an org with employees but no structures names the missing structures", async () => {
    const { orgId, caller } = await freshOrg();
    await seedEmp(orgId, { code: "EMP-0001", state: "Karnataka" }); // has a state, no structure

    const { payrollReadiness } = await caller.getChecklist();

    expect(payrollReadiness.ready).toBe(false);
    const codes = payrollReadiness.blockers.map((b) => b.code);
    expect(codes).toContain("no_structures");
    // There IS an employee, so no_employees must not fire; and with zero structures
    // to assign we do not also spam a per-employee structure gap.
    expect(codes).not.toContain("no_employees");
    expect(codes).not.toContain("employees_missing_structure");
  });

  it("an org whose employees lack a state names those employees", async () => {
    const { orgId, caller } = await freshOrg();
    const structId = await seedStructure(orgId);
    await seedEmp(orgId, { code: "EMP-NOSTATE", salaryStructureId: structId }); // structure set, state NULL

    const { payrollReadiness } = await caller.getChecklist();

    expect(payrollReadiness.ready).toBe(false);
    const stateBlocker = payrollReadiness.blockers.find((b) => b.code === "employees_missing_state");
    expect(stateBlocker).toBeTruthy();
    expect(stateBlocker!.message).toContain("EMP-NOSTATE");
    expect(stateBlocker!.href).toBe("/app/hr");
    // Structure exists and is assigned ⇒ neither structure blocker fires.
    const codes = payrollReadiness.blockers.map((b) => b.code);
    expect(codes).not.toContain("no_structures");
    expect(codes).not.toContain("employees_missing_structure");
    expect(codes).not.toContain("no_employees");
  });

  it("an org with a structure and a complete employee is genuinely ready", async () => {
    const { orgId, caller } = await freshOrg();
    const structId = await seedStructure(orgId);
    await seedEmp(orgId, { code: "EMP-OK", salaryStructureId: structId, state: "Karnataka" });

    const { payrollReadiness } = await caller.getChecklist();

    expect(payrollReadiness.ready).toBe(true);
    expect(payrollReadiness.blockers).toHaveLength(0);
  });

  it("completing the wizard still succeeds whether or not the org is payroll-ready", async () => {
    // Not-ready org (empty): completeWizard must not be blocked by readiness.
    const empty = await freshOrg();
    await expect(empty.caller.completeWizard({})).resolves.toEqual({ success: true });

    // Ready org: still succeeds.
    const ready = await freshOrg();
    const structId = await seedStructure(ready.orgId);
    await seedEmp(ready.orgId, { code: "EMP-OK", salaryStructureId: structId, state: "Karnataka" });
    await expect(ready.caller.completeWizard({})).resolves.toEqual({ success: true });
  });
});
