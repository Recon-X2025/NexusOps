/**
 * Work orders (Seq 2) — C6: itil has work_orders read-only (no create).
 * @see docs/QA_WORK_ORDERS_ITSM_E2E_TEST_PACK.md Part III
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Work orders RBAC (Seq 2 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let agentToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for work-orders-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    agentToken = await createSession(orgCtx.agentId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("itil cannot create work order (work_orders:write)", async () => {
    const itilCaller = await authedCaller(agentToken);
    await expect(
      itilCaller.workOrders.create({
        shortDescription: "Denied WO",
        type: "corrective",
        priority: "4_low",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("itil can list work orders (work_orders:read)", async () => {
    const itilCaller = await authedCaller(agentToken);
    const listed = await itilCaller.workOrders.list({ limit: 5 });
    expect(listed).toHaveProperty("items");
    expect(Array.isArray((listed as { items: unknown[] }).items)).toBe(true);
  });
});
