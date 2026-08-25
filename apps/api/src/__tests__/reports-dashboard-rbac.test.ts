/**
 * Reports + dashboard (Seq 8–9) — C6: base `requester` has no `reports:read`.
 * @see docs/QA_REPORTS_ITSM_E2E_TEST_PACK.md Part IV · `QA_DASHBOARD_ITSM_E2E_TEST_PACK.md` Part IV
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Reports + dashboard RBAC (Seq 8–9 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for reports-dashboard-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId); // report_viewer: reports:read, NOT financial:read
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot executiveOverview (reports:read)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(caller.reports.executiveOverview({ days: 7 })).rejects.toThrow(
      /FORBIDDEN|permission denied/i,
    );
  });

  it("requester cannot dashboard.getTimeSeries (reports:read)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(caller.dashboard.getTimeSeries({ days: 30 })).rejects.toThrow(
      /FORBIDDEN|permission denied/i,
    );
  });

  it("admin can load reports + dashboard (sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const o = await caller.reports.executiveOverview({ days: 7 });
    expect(o).toBeDefined();
    const ts = await caller.dashboard.getTimeSeries({ days: 30 });
    expect(ts).toHaveProperty("created");
  });

  it("H7 sibling: dashboard.getMetrics withholds AP/AR from a reports-only role", async () => {
    // report_viewer has reports:read but not financial:read → the company AP/AR
    // outstanding totals must be null (withheld), not a leaked number.
    const viewer = await authedCaller(viewerToken);
    const m = await viewer.dashboard.getMetrics();
    expect(m.payableOutstanding).toBeNull();
    expect(m.receivableOutstanding).toBeNull();

    // admin (financial:read) still gets the figures.
    const admin = await authedCaller(adminToken);
    const am = await admin.dashboard.getMetrics();
    expect(typeof am.payableOutstanding).toBe("number");
    expect(typeof am.receivableOutstanding).toBe("number");
  });
});
