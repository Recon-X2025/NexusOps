/**
 * Seq 21–23 sprint — C6: viewer/report_viewer cannot touch financial-class writes
 * (accounting router uses `financial` module) or inventory (`work_orders` module).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Finance sequence 21–23 RBAC (Seq sprint C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for finance-sequence-21-23-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot seed COA (accounting → financial:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(viewerCaller.accounting.coa.seed()).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot create inventory item (inventory → work_orders:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.inventory.create({
        partNumber: "DENIED-PN",
        name: "Denied item",
        qty: 0,
        minQty: 0,
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("admin can still seed COA after RBAC checks", async () => {
    const adminCaller = await authedCaller(adminToken);
    const res = (await adminCaller.accounting.coa.seed()) as { seeded: number };
    expect(res.seeded).toBeGreaterThanOrEqual(0);
    const rows = await adminCaller.accounting.coa.list({ activeOnly: true });
    expect((rows as unknown[]).length).toBeGreaterThan(0);
  });
});
