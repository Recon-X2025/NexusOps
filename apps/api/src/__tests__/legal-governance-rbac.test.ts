/**
 * LG wave — C6: viewer must not perform sensitive writes on legal (grc) or secretarial.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Legal & Governance RBAC (LG C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for legal-governance-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("viewer cannot create legal investigation (grc:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.legal.createInvestigation({
        title: "Should be denied",
        type: "ethics",
        anonymousReport: false,
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot create legal matter (grc:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    await expect(
      viewerCaller.legal.createMatter({
        title: "Denied matter",
        type: "commercial",
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("viewer cannot create secretarial meeting (secretarial:write)", async () => {
    const viewerCaller = await authedCaller(viewerToken);
    const when = new Date(Date.now() + 86400000).toISOString();
    await expect(
      viewerCaller.secretarial.meetings.create({
        title: "Denied meeting",
        scheduledAt: when,
      }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });

  it("admin can still create secretarial meeting after RBAC matrix enforced", async () => {
    const adminCaller = await authedCaller(adminToken);
    const when = new Date(Date.now() + 2 * 86400000).toISOString();
    const mtg = await adminCaller.secretarial.meetings.create({
      title: "Admin RBAC sanity meeting",
      scheduledAt: when,
    }) as { id: string };
    expect(mtg.id).toBeDefined();
  });
});
