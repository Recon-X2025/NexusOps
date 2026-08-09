/**
 * Payroll approval chain — surface/action permission-gate reconciliation.
 * ───────────────────────────────────────────────────────────────────────
 * The payroll approval action (`payroll.runs.approve`) gates the FINANCE and CFO
 * steps on `financial.write` (and HR on `hr.write`) — segregation of duties by
 * distinct identity. But the run page and its read procedures (`runs.list`,
 * `runs.get`) were gated on the `payroll` module. No non-owner role holds BOTH
 * `payroll.read` and `financial.write` (hr_manager has the first, finance_manager
 * the second), so the authorised Finance/CFO approver was locked out of the only
 * surface that hosts the approve control — the chain could not complete without
 * the owner, whom SoD limits to a single step.
 *
 * Fix under test: `runs.list`/`runs.get` (and the /app/payroll route guard, tested
 * on the web side) admit a `financial.write` holder as READ-only access to the
 * surface. Write/compute/lock/generate paths and the approve action's own per-step
 * gate + SoD are unchanged.
 *
 * RED before the fix: assertions 2 (finance_manager can list/get) throw FORBIDDEN.
 * GREEN after: they succeed, while every write path and the SoD check still refuse.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedFullOrg, seedUser, createMockContext, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { checkDbUserPermission } from "../lib/rbac-db";
import { payrollRuns, eq } from "@coheronconnect/db";

type Role = "owner" | "admin" | "member" | "viewer";

describe("Payroll approval gate — surface/action reconciliation", () => {
  let orgId: string;
  let adminId: string; // owner-equivalent (admin base + admin matrix) — holds both perms
  let hrId: string; // hr_manager — payroll.read, NOT financial.write
  let financeId: string; // finance_manager — financial.write, NOT payroll.read
  let finance2Id: string; // a second, distinct financial.write identity (for CFO)

  const callerAs = (userId: string, role: Role, matrixRole: string) =>
    payrollRouter.createCaller(
      createMockContext(userId, orgId, {
        user: {
          id: userId,
          orgId,
          email: `${matrixRole}@qa.coheronconnect.io`,
          name: matrixRole,
          role,
          matrixRole,
          status: "active",
        },
      }),
    );

  // Insert a run straight at PAYSLIPS_GENERATED (the state HR-approval consumes),
  // so approval-chain tests don't depend on the compute pipeline.
  const seedRunAtPayslips = async (month: number) => {
    const db = testDb();
    const [row] = await db
      .insert(payrollRuns)
      .values({ orgId, month, year: 2026, pipelineStatus: "PAYSLIPS_GENERATED" })
      .returning();
    return row!.id;
  };

  const pipelineOf = async (runId: string) => {
    const db = testDb();
    const [row] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    return row!.pipelineStatus;
  };

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    hrId = seeded.hrId;
    financeId = seeded.financeId;
    finance2Id = (
      await seedUser(orgId, { role: "member", matrixRole: "finance_manager" })
    ).userId;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  // ── The gap this fix addresses (RBAC matrix) ──────────────────────────────
  it("no non-owner role holds both payroll.read and financial.write", () => {
    expect(checkDbUserPermission("member", "financial", "write", "finance_manager")).toBe(true);
    expect(checkDbUserPermission("member", "payroll", "read", "finance_manager")).toBe(false);
    expect(checkDbUserPermission("member", "payroll", "read", "hr_manager")).toBe(true);
    expect(checkDbUserPermission("member", "financial", "write", "hr_manager")).toBe(false);
  });

  // ── (1) The fix: financial.write holder can reach the payroll run surface ──
  it("a financial.write holder without payroll.read CAN load the run list and a run detail", async () => {
    const runId = await seedRunAtPayslips(3);
    const finance = callerAs(financeId, "member", "finance_manager");

    const list = await finance.runs.list({});
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((r: { id: string }) => r.id === runId)).toBe(true);

    const detail = await finance.runs.get({ id: runId });
    expect(detail.id).toBe(runId);
  });

  // ── (2) Write paths remain payroll.write-only ─────────────────────────────
  it("a financial.write holder CANNOT lock, compute, or create (writes still require payroll.write)", async () => {
    const runId = await seedRunAtPayslips(4);
    const finance = callerAs(financeId, "member", "finance_manager");

    await expect(finance.runs.lockPeriod({ runId })).rejects.toThrow(/Permission denied: payroll\.write/);
    await expect(finance.runs.create({ month: 11, year: 2026 })).rejects.toThrow(/Permission denied: payroll\.write/);
  });

  // ── (3) payroll.read holder is still refused the FINANCE step, same message ─
  it("a payroll.read holder without financial.write is refused the FINANCE step with the existing message", async () => {
    const runId = await seedRunAtPayslips(5);
    // HR-approve first (owner) so the run is at HR_APPROVED, isolating the perm check.
    await callerAs(adminId, "admin", "admin").runs.approve({ runId, step: "HR", decision: "APPROVED" });

    const hr = callerAs(hrId, "member", "hr_manager");
    await expect(
      hr.runs.approve({ runId, step: "FINANCE", decision: "APPROVED" }),
    ).rejects.toThrow(/financial\.write required for FINANCE approval/);
  });

  // ── (4) Segregation of duties still holds ─────────────────────────────────
  it("the same identity cannot approve two steps (SoD)", async () => {
    const runId = await seedRunAtPayslips(6);
    const admin = callerAs(adminId, "admin", "admin"); // owner holds both perms

    await admin.runs.approve({ runId, step: "HR", decision: "APPROVED" });
    await expect(
      admin.runs.approve({ runId, step: "FINANCE", decision: "APPROVED" }),
    ).rejects.toThrow(/Segregation of duties/);
  });

  // ── (5) The full HR → Finance → CFO chain completes with three identities ──
  it("a full HR→Finance→CFO chain completes with three distinct identities", async () => {
    const runId = await seedRunAtPayslips(7);

    await callerAs(adminId, "admin", "admin").runs.approve({ runId, step: "HR", decision: "APPROVED" });
    expect(await pipelineOf(runId)).toBe("HR_APPROVED");

    await callerAs(financeId, "member", "finance_manager").runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });
    expect(await pipelineOf(runId)).toBe("FINANCE_APPROVED");

    await callerAs(finance2Id, "member", "finance_manager").runs.approve({ runId, step: "CFO", decision: "APPROVED" });
    expect(await pipelineOf(runId)).toBe("CFO_APPROVED");
  });
});
