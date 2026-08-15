/**
 * Configurable payroll approval chain — 2 or 3 steps.
 *
 * The chain was fixed at HR → FINANCE → CFO. A 30-person company has no CFO, so
 * one person approving HR was blocked at FINANCE and again at CFO by the
 * segregation rule, and the run could never complete (a 403 on the live tenant).
 *
 * SEGREGATION IS UNCHANGED at either length — two steps still means two different
 * people. Only the chain LENGTH is configurable, and only to 2 or 3.
 *
 * The critical design point: on a 2-step chain the FINANCE approval lands on
 * CFO_APPROVED, the terminal state that `generateStatutory` and bank-file
 * generation gate on. A separate terminal status would have silently stripped
 * 2-step tenants of statutory generation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { organizations, payrollRuns, eq } from "@coheronconnect/db";
import { payrollRouter } from "../routers/payroll";
import { adminRouter } from "../routers/admin";

/** Drive a run to PAYSLIPS_GENERATED, the state the HR approval starts from. */
async function seedRunAt(orgId: string, pipelineStatus: string, chainLength: 2 | 3) {
  const [run] = await testDb().insert(payrollRuns).values({
    orgId, month: 4, year: 2026, status: "draft",
    pipelineStatus, runNumber: Math.floor(Math.random() * 1_000_000),
    approvalChainLength: chainLength,
    workflowMetadata: { errors: [], approvals: [] },
  } as never).returning({ id: payrollRuns.id });
  return run!.id;
}

async function setOrgChain(orgId: string, len: 2 | 3) {
  const [row] = await testDb().select({ settings: organizations.settings })
    .from(organizations).where(eq(organizations.id, orgId));
  await testDb().update(organizations)
    .set({ settings: { ...((row?.settings ?? {}) as object), payroll: { approvalChainLength: len } } })
    .where(eq(organizations.id, orgId));
}

async function statusOf(runId: string) {
  const [r] = await testDb().select({ s: payrollRuns.pipelineStatus, len: payrollRuns.approvalChainLength })
    .from(payrollRuns).where(eq(payrollRuns.id, runId));
  return r!;
}

describe("payroll approval chain length", () => {
  let orgId: string;
  let hrUser: string;
  let finUser: string;
  let cfoUser: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId: hrUser } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    ({ userId: finUser } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    ({ userId: cfoUser } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  const caller = (uid: string) => payrollRouter.createCaller(createMockContext(uid, orgId));

  it("a TWO-step run completes after the second approval, landing on CFO_APPROVED", async () => {
    const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 2);
    await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
    await caller(finUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });

    // Terminal state is CFO_APPROVED — what every downstream consumer gates on.
    expect((await statusOf(runId)).s).toBe("CFO_APPROVED");
  });

  it("a THREE-step run still requires all three", async () => {
    const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 3);
    await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
    await caller(finUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });

    // Not terminal yet — the CFO step is still outstanding.
    expect((await statusOf(runId)).s).toBe("FINANCE_APPROVED");

    await caller(cfoUser).runs.approve({ runId, step: "CFO", decision: "APPROVED" });
    expect((await statusOf(runId)).s).toBe("CFO_APPROVED");
  });

  it("the CFO step is REJECTED on a two-step run, with a message explaining why", async () => {
    const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 2);
    await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
    await caller(finUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });

    await expect(
      caller(cfoUser).runs.approve({ runId, step: "CFO", decision: "APPROVED" }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/two-step approval chain/i) });
  });

  describe("segregation of duties is unchanged at BOTH lengths", () => {
    it("three-step: the HR approver cannot also approve FINANCE", async () => {
      const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 3);
      await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
      await expect(
        caller(hrUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("TWO-step: the HR approver still cannot also approve FINANCE", async () => {
      const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 2);
      await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
      await expect(
        caller(hrUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("the setting", () => {
    it("defaults to THREE so an existing tenant is unaffected", async () => {
      const admin = adminRouter.createCaller(createMockContext(hrUser, orgId));
      expect((await admin.payrollPolicy.get()).approvalChainLength).toBe(3);
    });

    it("accepts 2 and 3", async () => {
      const admin = adminRouter.createCaller(createMockContext(hrUser, orgId));
      expect((await admin.payrollPolicy.update({ approvalChainLength: 2 })).approvalChainLength).toBe(2);
      expect((await admin.payrollPolicy.get()).approvalChainLength).toBe(2);
      expect((await admin.payrollPolicy.update({ approvalChainLength: 3 })).approvalChainLength).toBe(3);
    });

    it("REJECTS 1 and 4 at the API boundary, not only in the UI", async () => {
      const admin = adminRouter.createCaller(createMockContext(hrUser, orgId));
      await expect(admin.payrollPolicy.update({ approvalChainLength: 1 } as never)).rejects.toThrow();
      await expect(admin.payrollPolicy.update({ approvalChainLength: 4 } as never)).rejects.toThrow();
      // Still the previous value — a rejected write changes nothing.
      expect((await admin.payrollPolicy.get()).approvalChainLength).toBe(3);
    });

    it("a new run is STAMPED with the org setting at creation", async () => {
      await setOrgChain(orgId, 2);
      const created = await caller(hrUser).runs.create({ month: 7, year: 2026 } as never);
      const [row] = await testDb()
        .select({ len: payrollRuns.approvalChainLength })
        .from(payrollRuns)
        .where(eq(payrollRuns.id, (created as { id: string }).id));
      expect(row!.len).toBe(2);
    });

    it("changing the setting does NOT affect a run already created", async () => {
      // Run created while the org was on three steps.
      const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 3);
      // Tenant switches to two mid-cycle.
      await setOrgChain(orgId, 2);

      await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
      await caller(finUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });

      // The in-flight run keeps its ORIGINAL three-step chain: not terminal yet.
      expect((await statusOf(runId)).s).toBe("FINANCE_APPROVED");
      expect((await statusOf(runId)).len).toBe(3);

      // And its CFO step is still available.
      await caller(cfoUser).runs.approve({ runId, step: "CFO", decision: "APPROVED" });
      expect((await statusOf(runId)).s).toBe("CFO_APPROVED");
    });
  });

  it("statutory generation is reachable on a completed TWO-step run", async () => {
    const runId = await seedRunAt(orgId, "PAYSLIPS_GENERATED", 2);
    await caller(hrUser).runs.approve({ runId, step: "HR", decision: "APPROVED" });
    await caller(finUser).runs.approve({ runId, step: "FINANCE", decision: "APPROVED" });

    // generateStatutory refuses anything not at CFO_APPROVED. A 2-step run must
    // therefore get PAST that gate — if it fails, it must not be for that reason.
    let message = "";
    try {
      await caller(hrUser).generateStatutory({ runId });
    } catch (e) {
      message = (e as { message?: string }).message ?? "";
    }
    expect(message).not.toMatch(/CFO approval required/i);
  });
});
