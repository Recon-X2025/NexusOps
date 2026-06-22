/** HR + CRM (Seq 15–16 C6) — @see docs/QA_HR_ITSM_SERIAL_CLOSURE.md / QA_CRM_ITSM_SERIAL_CLOSURE.md */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("HR + CRM RBAC (Seq 15–16 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot crm.createAccount (accounts:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.crm.createAccount({ name: "Denied Corp", industry: "Tech" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin can crm.createAccount (sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const a = (await caller.crm.createAccount({
      name: `RBAC CRM ${Date.now()}`,
      industry: "Technology",
    })) as { id: string };
    expect(a.id).toBeDefined();
  });

  it("admin can hr.employees.list (hr:read sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const rows = await caller.hr.employees.list({});
    expect(Array.isArray(rows)).toBe(true);
  });
});
