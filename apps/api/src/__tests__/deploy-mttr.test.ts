/**
 * Deploy→incident MTTR (Sprint 3.4b).
 *
 * `devops.doraMetrics.mttrMinutes` was hardcoded null because deployments and
 * incidents were never linked. This closes the loop: a FAILED deployment auto-
 * creates an incident with `tickets.deploymentId` set; resolving that incident
 * lets doraMetrics compute mean-time-to-restore.
 *
 * Invariants asserted:
 *   • a failed production deployment auto-creates exactly one linked incident;
 *   • resolving that incident makes doraMetrics.mttrMinutes non-null + correct;
 *   • a successful deployment creates no incident;
 *   • the auto-incident path performs NO financial mutation.
 *
 * The devops queries are org-scoped, so no cross-test cleanup is required beyond
 * the fresh org seeded per test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { seedFullOrg, testDb, makeContext } from "./helpers";
import { appRouter } from "../routers";
import { tickets, deployments, journalEntries } from "@coheronconnect/db";

describe("Deploy→incident MTTR (Sprint 3.4b)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  function caller() {
    return appRouter.createCaller(makeContext(adminId, orgId));
  }

  async function incidentsForOrg() {
    return testDb()
      .select()
      .from(tickets)
      .where(and(eq(tickets.orgId, orgId), eq(tickets.type, "incident")));
  }

  it("auto-creates a linked incident on a failed deployment", async () => {
    const c = caller();
    const dep = await c.devops.createDeployment({
      appName: "api",
      environment: "production",
      version: "1.2.3",
    });

    await c.devops.completeDeployment({ id: dep.id, status: "failed", durationSeconds: 120 });

    const incidents = await incidentsForOrg();
    expect(incidents.length).toBe(1);
    expect(incidents[0]!.deploymentId).toBe(dep.id);
    expect(incidents[0]!.isMajorIncident).toBe(true); // production
    expect(incidents[0]!.title).toContain("Deployment failed: api 1.2.3 (production)");
  });

  it("a successful deployment creates no incident", async () => {
    const c = caller();
    const dep = await c.devops.createDeployment({
      appName: "web",
      environment: "production",
      version: "2.0.0",
    });
    await c.devops.completeDeployment({ id: dep.id, status: "success", durationSeconds: 60 });

    expect((await incidentsForOrg()).length).toBe(0);
  });

  it("computes mttrMinutes once the linked incident is resolved", async () => {
    const c = caller();
    const dep = await c.devops.createDeployment({
      appName: "api",
      environment: "production",
      version: "3.1.0",
    });
    await c.devops.completeDeployment({ id: dep.id, status: "failed", durationSeconds: 90 });

    const [incident] = await incidentsForOrg();
    expect(incident).toBeTruthy();

    // Pin the deployment completion instant and resolve the incident 30 min later
    // for a deterministic MTTR of 30.
    const completedAt = new Date();
    const resolvedAt = new Date(completedAt.getTime() + 30 * 60_000);
    await testDb()
      .update(deployments)
      .set({ completedAt })
      .where(eq(deployments.id, dep.id));
    await testDb()
      .update(tickets)
      .set({ resolvedAt })
      .where(eq(tickets.id, incident!.id));

    const dora = await c.devops.doraMetrics();
    expect(dora.mttrMinutes).toBe(30);
  });

  it("mttrMinutes is null with no resolved deployment-incidents", async () => {
    const c = caller();
    const dep = await c.devops.createDeployment({
      appName: "api",
      environment: "production",
      version: "4.0.0",
    });
    // Failed but incident left unresolved → MTTR still null.
    await c.devops.completeDeployment({ id: dep.id, status: "failed", durationSeconds: 90 });

    const dora = await c.devops.doraMetrics();
    expect(dora.mttrMinutes).toBeNull();
  });

  it("performs NO financial mutation on the auto-incident path", async () => {
    const before = await testDb().select().from(journalEntries);
    const c = caller();
    const dep = await c.devops.createDeployment({
      appName: "api",
      environment: "production",
      version: "5.0.0",
    });
    await c.devops.completeDeployment({ id: dep.id, status: "failed", durationSeconds: 90 });

    const after = await testDb().select().from(journalEntries);
    expect(after.length).toBe(before.length);
  });
});
