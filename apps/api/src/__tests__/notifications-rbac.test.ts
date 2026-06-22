/**
 * Notifications (Seq 6) — C6: `notifications.send` requires `users:write`; viewer denied.
 * @see docs/QA_NOTIFICATIONS_ITSM_E2E_TEST_PACK.md Part IV
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Notifications RBAC (Seq 6 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let viewerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for notifications-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    viewerToken = await createSession(orgCtx.viewerId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot send in-app notification (users:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.notifications.send({
        userId: orgCtx.agentId,
        title: "Denied",
        body: "x",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("admin can send notification (sanity)", async () => {
    const adminCaller = await authedCaller(adminToken);
    const row = (await adminCaller.notifications.send({
      userId: orgCtx.viewerId,
      title: "RBAC sanity",
      type: "info",
    })) as { id: string };
    expect(row.id).toBeDefined();
  });
});
