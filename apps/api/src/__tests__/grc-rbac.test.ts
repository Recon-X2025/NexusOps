/** GRC (Seq 13 C6) — @see docs/QA_GRC_ITSM_E2E_TEST_PACK.md Part II */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("GRC router RBAC (Seq 13 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let viewerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    viewerToken = await createSession(orgCtx.viewerId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot createRisk (grc:write)", async () => {
    const caller = await authedCaller(viewerToken);
    await expect(
      caller.grc.createRisk({ title: "Denied", category: "operational", likelihood: 1, impact: 1 }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("admin can listRisks + createRisk (sanity)", async () => {
    const caller = await authedCaller(adminToken);
    const r = (await caller.grc.createRisk({
      title: "RBAC smoke risk",
      category: "technology",
      likelihood: 2,
      impact: 2,
    })) as { id: string };
    const rows = await caller.grc.listRisks({ limit: 50 });
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as { id: string }[]).some((x) => x.id === r.id)).toBe(true);
  });
});
