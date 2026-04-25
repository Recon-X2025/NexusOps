/**
 * Admin console (Seq 10) — C6: only org `owner` / `admin` DB roles may call `admin.*`.
 * @see docs/QA_ADMIN_ITSM_E2E_TEST_PACK.md Part II
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Admin router RBAC (Seq 10 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;
  let viewerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for admin-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    viewerToken = await createSession(orgCtx.viewerId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot admin.users.list", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(caller.admin.users.list({})).rejects.toThrow(/FORBIDDEN|Admin access required/i);
  });

  it("viewer cannot admin.auditLog.list", async () => {
    const caller = await authedCaller(viewerToken);
    await expect(caller.admin.auditLog.list({ limit: 5 })).rejects.toThrow(/FORBIDDEN|Admin access required/i);
  });

  it("admin can list users and audit log", async () => {
    const caller = await authedCaller(adminToken);
    const users = (await caller.admin.users.list({})) as { id: string }[];
    expect(users.length).toBeGreaterThan(0);
    const log = (await caller.admin.auditLog.list({ limit: 5 })) as { items: unknown[] };
    expect(Array.isArray(log.items)).toBe(true);
  });
});
