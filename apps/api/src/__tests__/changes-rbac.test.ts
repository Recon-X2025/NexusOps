/**
 * Changes (Seq 1) — C6: viewer + report_viewer must not create, approve, or comment-write.
 * @see docs/QA_CHANGES_ITSM_E2E_TEST_PACK.md Part IV
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Changes RBAC (Seq 1 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for changes-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot create a change request (changes:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.changes.create({
        title: "Denied CR",
        type: "normal",
        risk: "low",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot approve a submitted change (changes:approve)", async () => {
    const adminCaller = await authedCaller(adminToken);
    const ch = (await adminCaller.changes.create({
      title: "RBAC approve target",
      type: "normal",
      risk: "low",
    })) as { id: string };
    await adminCaller.changes.submitForApproval({ id: ch.id });

    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.changes.approve({ changeId: ch.id, comments: "Should fail" }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot add comment on change (changes:write)", async () => {
    const adminCaller = await authedCaller(adminToken);
    const ch = (await adminCaller.changes.create({
      title: "RBAC comment target",
      type: "standard",
      risk: "low",
    })) as { id: string };

    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.changes.addComment({ changeId: ch.id, body: "Denied comment" }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });
});
