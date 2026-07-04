/**
 * CMDB dependency-cycle guard (Sprint 2 carry-over).
 *
 * `assets.cmdb.linkCi` previously only rejected self-loops. It now rejects any
 * relationship whose addition would close a directed cycle in the CI dependency
 * graph — adding source→target is rejected iff `target` can already reach
 * `source` via existing directed edges. This keeps downstream traversals
 * (service maps, impact analysis) acyclic and terminating.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { assetsRouter } from "../routers/assets";
import { ciRelationships, eq } from "@coheronconnect/db";

describe("CMDB linkCi — rejects relationships that would create a dependency cycle", () => {
  let orgId: string;
  let caller: any;

  async function seedCi(name: string, ciType: "server" | "application" | "database" = "server"): Promise<string> {
    const ci = (await caller.cmdb.createCi({ name, ciType })) as { id: string };
    return ci.id;
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = assetsRouter.createCaller(createMockContext(seeded.adminId!, orgId));
  });

  it("allows edges that keep the graph acyclic (a DAG)", async () => {
    const a = await seedCi("A");
    const b = await seedCi("B", "application");
    const c = await seedCi("C", "database");
    await caller.cmdb.linkCi({ sourceId: a, targetId: b, relationType: "depends_on" });
    await caller.cmdb.linkCi({ sourceId: b, targetId: c, relationType: "depends_on" });

    const rels = await testDb().select().from(ciRelationships).where(eq(ciRelationships.sourceId, a));
    expect(rels).toHaveLength(1);
  });

  it("rejects an edge that closes a cycle (A→B, B→C, then C→A)", async () => {
    const a = await seedCi("A");
    const b = await seedCi("B", "application");
    const c = await seedCi("C", "database");
    await caller.cmdb.linkCi({ sourceId: a, targetId: b, relationType: "depends_on" });
    await caller.cmdb.linkCi({ sourceId: b, targetId: c, relationType: "depends_on" });

    await expect(
      caller.cmdb.linkCi({ sourceId: c, targetId: a, relationType: "depends_on" }),
    ).rejects.toThrow(/cycle/i);

    // No third relationship was written.
    const all = await testDb().select().from(ciRelationships).where(eq(ciRelationships.targetId, a));
    expect(all).toHaveLength(0);
  });

  it("still rejects a self-loop", async () => {
    const a = await seedCi("A");
    await expect(
      caller.cmdb.linkCi({ sourceId: a, targetId: a, relationType: "depends_on" }),
    ).rejects.toThrow(/differ/i);
  });

  it("detects a cycle spanning different relationType values", async () => {
    const a = await seedCi("A");
    const b = await seedCi("B", "application");
    await caller.cmdb.linkCi({ sourceId: a, targetId: b, relationType: "depends_on" });
    // B→A via a different relation type would still close a 2-cycle.
    await expect(
      caller.cmdb.linkCi({ sourceId: b, targetId: a, relationType: "connected_to" }),
    ).rejects.toThrow(/cycle/i);
  });

  it("allows a non-cycling parallel edge between the same pair", async () => {
    const a = await seedCi("A");
    const b = await seedCi("B", "application");
    await caller.cmdb.linkCi({ sourceId: a, targetId: b, relationType: "depends_on" });
    // A→B again (different relation type) does not close a cycle → allowed.
    const rel = await caller.cmdb.linkCi({ sourceId: a, targetId: b, relationType: "runs_on" });
    expect(rel).toBeTruthy();
    const rels = await testDb().select().from(ciRelationships).where(eq(ciRelationships.sourceId, a));
    expect(rels).toHaveLength(2);
  });
});
