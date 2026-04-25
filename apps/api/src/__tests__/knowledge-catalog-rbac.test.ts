/**
 * Knowledge + catalog (Seq 3–4) — C6: viewer cannot write KB; viewer cannot catalog **admin** (`updateItem`).
 * @see docs/QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md Part IV
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Knowledge + catalog RBAC (Seq 3–4 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let viewerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for knowledge-catalog-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    viewerToken = await createSession(orgCtx.viewerId);
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot create KB article (knowledge:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.knowledge.create({
        title: "Denied",
        content: "x",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot catalog.updateItem (catalog:admin)", async () => {
    const adminCaller = await authedCaller(adminToken);
    const item = (await adminCaller.catalog.createItem({
      name: "RBAC catalog item for admin gate",
      category: "it",
      approvalRequired: false,
    })) as { id: string };

    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.catalog.updateItem({ id: item.id, name: "Should not apply" }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });
});
