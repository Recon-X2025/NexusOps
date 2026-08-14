/**
 * AUTHZ sweep — protectedProcedure mutations that lacked an in-body permission check.
 *
 * Each fix gets the mandated pair, called DIRECTLY at the procedure (not through a form,
 * which would be bypassable): a member WITHOUT the permission is refused, and the role
 * that SHOULD have it still succeeds (the regression guard).
 *
 * Covers: STATUTORY-IDENTITY-UNGATED (Step 1) + the 6 UNGATED-MATTERS from the sweep.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("AUTHZ sweep — ungated protectedProcedure mutations", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string; // plain member (["requester"]) — has hr.write, NOT payroll/onboarding/hr.admin
  let adminToken: string;
  let hrToken: string;   // hr_manager — has payroll.write, onboarding.write, hr.admin
  let agentToken: string; // member+itil — a non-party member for scope tests

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    adminToken = await createSession(orgCtx.adminId);
    hrToken = await createSession(orgCtx.hrId);
    agentToken = await createSession(orgCtx.agentId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  // ── Step 1: onboarding.updateStatutoryIdentity — PF rate is money ──────────
  describe("onboarding.updateStatutoryIdentity (payroll.write)", () => {
    it("a plain member is DENIED (cannot change the PF rate)", async () => {
      const caller = await authedCaller(requesterToken);
      await expect(
        caller.onboarding.updateStatutoryIdentity({
          pfContributionRate: 10,
          pfReducedRateReason: "under_20_employees",
        }),
      ).rejects.toThrow(/FORBIDDEN|permission/i);
    });
    it("hr_manager is ALLOWED (regression guard)", async () => {
      const caller = await authedCaller(hrToken);
      const r = await caller.onboarding.updateStatutoryIdentity({ epfCode: "MHBAN0012345000" });
      expect(r).toEqual({ success: true });
    });
  });

  // ── Sweep: onboarding.saveWizardData — org-wide statutory config ───────────
  describe("onboarding.saveWizardData (payroll.write)", () => {
    it("a plain member is DENIED", async () => {
      const caller = await authedCaller(requesterToken);
      await expect(caller.onboarding.saveWizardData({})).rejects.toThrow(/FORBIDDEN|permission/i);
    });
    it("hr_manager is ALLOWED", async () => {
      const caller = await authedCaller(hrToken);
      const r = await caller.onboarding.saveWizardData({ step: 2 });
      expect(r).toEqual({ success: true });
    });
  });

  // ── Sweep: onboarding.completeWizard ──────────────────────────────────────
  describe("onboarding.completeWizard (onboarding.write)", () => {
    it("a plain member is DENIED", async () => {
      const caller = await authedCaller(requesterToken);
      await expect(caller.onboarding.completeWizard({})).rejects.toThrow(/FORBIDDEN|permission/i);
    });
    it("hr_manager is ALLOWED", async () => {
      const caller = await authedCaller(hrToken);
      const r = await caller.onboarding.completeWizard({});
      expect(r).toEqual({ success: true });
    });
  });

  // ── Sweep: performance.updateGoal — owner-scope ───────────────────────────
  describe("performance.updateGoal (owner-scope)", () => {
    it("a member cannot edit another user's goal (NOT_FOUND — owner filter)", async () => {
      const admin = await authedCaller(adminToken);
      const goal = (await admin.performance.createGoal({ title: `Goal ${Date.now()}` })) as { id: string };
      const req = await authedCaller(requesterToken);
      await expect(req.performance.updateGoal({ id: goal.id, progress: 99 })).rejects.toThrow(/NOT_FOUND|not found/i);
    });
    it("the owner can edit their own goal", async () => {
      const admin = await authedCaller(adminToken);
      const goal = (await admin.performance.createGoal({ title: `Goal2 ${Date.now()}` })) as { id: string };
      const updated = (await admin.performance.updateGoal({ id: goal.id, progress: 50 })) as { id: string };
      expect(updated.id).toBe(goal.id);
    });
  });

  // ── Sweep: expenseReports.addItem / deleteItem — owner-scope ────────────────────
  describe("expenseReports.addItem / deleteItem (owner-scope)", () => {
    it("a member cannot add an item to another's report (NOT_FOUND)", async () => {
      const admin = await authedCaller(adminToken);
      const report = (await admin.expenseReports.createReport({ title: `Rpt ${Date.now()}` })) as { id: string };
      const req = await authedCaller(requesterToken);
      await expect(
        req.expenseReports.addItem({ reportId: report.id, category: "travel", description: "sneaky", amount: "100.00" }),
      ).rejects.toThrow(/NOT_FOUND|not found/i);
    });
    it("the owner can add an item to their own draft report", async () => {
      const admin = await authedCaller(adminToken);
      const report = (await admin.expenseReports.createReport({ title: `Rpt2 ${Date.now()}` })) as { id: string };
      const item = (await admin.expenseReports.addItem({
        reportId: report.id, category: "travel", description: "flight", amount: "250.00",
      })) as { id: string };
      expect(item.id).toBeDefined();
      // and can delete their own item
      const del = await admin.expenseReports.deleteItem({ id: item.id, reportId: report.id });
      expect(del).toEqual({ success: true });
    });
  });

  // ── Sweep: performance.updateReview — party-or-hr-admin scope ──────────────
  describe("performance.updateReview (party-or-hr-admin scope)", () => {
    it("a non-party member cannot edit someone else's review (FORBIDDEN)", async () => {
      const admin = await authedCaller(adminToken);
      const cycle = (await admin.performance.createCycle({ name: `Cycle ${Date.now()}` })) as { id: string };
      const review = (await admin.performance.createReview({
        cycleId: cycle.id, revieweeId: orgCtx.requesterId, reviewerId: orgCtx.adminId,
      })) as { id: string };
      const agent = await authedCaller(agentToken); // neither reviewee nor reviewer, no hr.admin
      await expect(agent.performance.updateReview({ id: review.id, overallRating: "5" })).rejects.toThrow(/FORBIDDEN|permission/i);
    });
    it("the reviewee (a member) can update their own review", async () => {
      const admin = await authedCaller(adminToken);
      const cycle = (await admin.performance.createCycle({ name: `Cycle2 ${Date.now()}` })) as { id: string };
      const review = (await admin.performance.createReview({
        cycleId: cycle.id, revieweeId: orgCtx.requesterId, reviewerId: orgCtx.adminId,
      })) as { id: string };
      const reviewee = await authedCaller(requesterToken);
      const updated = (await reviewee.performance.updateReview({ id: review.id, selfRating: "4" })) as { id: string };
      expect(updated.id).toBe(review.id);
    });
    it("an HR manager can update any review (regression guard)", async () => {
      const admin = await authedCaller(adminToken);
      const cycle = (await admin.performance.createCycle({ name: `Cycle3 ${Date.now()}` })) as { id: string };
      const review = (await admin.performance.createReview({
        cycleId: cycle.id, revieweeId: orgCtx.requesterId, reviewerId: orgCtx.adminId,
      })) as { id: string };
      const hr = await authedCaller(hrToken);
      const updated = (await hr.performance.updateReview({ id: review.id, overallRating: "3" })) as { id: string };
      expect(updated.id).toBe(review.id);
    });
  });
});
