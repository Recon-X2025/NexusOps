/**
 * Auth router (Seq 11) — C6: `users:write` / `users:delete` gated for invite, role update, delete.
 * @see docs/QA_AUTH_ITSM_E2E_TEST_PACK.md Part II
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Auth router RBAC (Seq 11 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for auth-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot inviteUser (users:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.auth.inviteUser({
        email: `x-${Date.now()}@qa.nexusops.io`,
        role: "member",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("requester cannot updateUserRole (users:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.auth.updateUserRole({ userId: orgCtx.agentId, matrixRole: "itil" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin can listUsers and inviteUser (sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const list = (await caller.auth.listUsers()) as { id: string }[];
    expect(list.length).toBeGreaterThan(0);
    const inv = await caller.auth.inviteUser({
      email: `rbac-inv-${Date.now()}@qa.nexusops.io`,
      role: "viewer",
    });
    expect(inv).toHaveProperty("inviteUrl");
  });
});
