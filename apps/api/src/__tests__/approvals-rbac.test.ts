/**
 * Approvals (Seq 5) — C6: viewer cannot `decide` (approvals:approve).
 * @see docs/QA_APPROVALS_E2E_TEST_PACK.md + Layer 8 §8.36
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Approvals RBAC (Seq 5 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for approvals-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot decide approval request (approvals:approve)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.approvals.decide({
        requestId: "00000000-0000-4000-8000-000000000002",
        decision: "approved",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });
});
