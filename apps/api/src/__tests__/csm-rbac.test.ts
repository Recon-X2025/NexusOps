/** CSM (Seq 14 C6) — @see docs/QA_CSM_ITSM_SERIAL_CLOSURE.md Part II */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("CSM router RBAC (Seq 14 C6)", () => {
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

  it("requester cannot csm.cases.create (csm:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.csm.cases.create({ title: "X", priority: "low" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin can create case (sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const c = (await caller.csm.cases.create({ title: "RBAC ok", priority: "medium" })) as { id: string };
    expect(c.id).toBeDefined();
  });
});
