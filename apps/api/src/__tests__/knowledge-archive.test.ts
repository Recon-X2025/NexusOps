/**
 * Knowledge base archive lifecycle (Phase 4 cleanup).
 *
 * The knowledge router (module: "knowledge") exposes an `archive` mutation that
 * flips an article to status "archived". This verifies the happy path, tenant
 * isolation, and RBAC gating (a viewer without knowledge:write is denied).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Knowledge archive (Phase 4)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for knowledge-archive tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    viewerToken = await createSession(orgCtx.viewerId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("archives an article, flipping its status to archived", async () => {
    const admin = await authedCaller(adminToken);
    const created = (await admin.knowledge.create({
      title: "Runbook to archive",
      content: "steps",
    })) as { id: string; status: string };
    expect(created.status).toBe("draft");

    const archived = (await admin.knowledge.archive({ id: created.id })) as {
      id: string;
      status: string;
    };
    expect(archived.status).toBe("archived");
  });

  it("throws NOT_FOUND for an unknown article id", async () => {
    const admin = await authedCaller(adminToken);
    await expect(
      admin.knowledge.archive({ id: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/not found/i);
  });

  it("is tenant-isolated: another org cannot archive this org's article", async () => {
    const admin = await authedCaller(adminToken);
    const created = (await admin.knowledge.create({
      title: "Cross-tenant guard",
      content: "x",
    })) as { id: string };

    const other = await seedFullOrg();
    const otherToken = await createSession(other.adminId);
    const foreign = await authedCaller(otherToken);
    await expect(
      foreign.knowledge.archive({ id: created.id }),
    ).rejects.toThrow(/not found/i);
    await cleanupOrg(other.orgId);
  });

  it("denies a viewer without knowledge:write", async () => {
    const admin = await authedCaller(adminToken);
    const created = (await admin.knowledge.create({
      title: "Viewer denied archive",
      content: "x",
    })) as { id: string };

    const viewer = await authedCaller(viewerToken);
    await expect(
      viewer.knowledge.archive({ id: created.id }),
    ).rejects.toThrow(/FORBIDDEN|permission denied/i);
  });
});
