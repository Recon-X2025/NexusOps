/**
 * OKR cascade / alignment tests (Sprint 0.8).
 *
 * okr_objectives gained a self-referential parent_objective_id (onDelete: set
 * null) so objectives can cascade org→team→individual. The hr.okr router now:
 *   • createObjective accepts an optional parentObjectiveId (tenant-guarded),
 *   • setParent aligns/detaches with a cycle guard,
 *   • cascade returns the alignment forest with rolled-up progress.
 * Also verifies SET NULL orphaning when a parent objective is deleted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { hrRouter } from "../routers/hr";
import { okrObjectives, eq } from "@coheronconnect/db";

const YEAR = 2026;

describe("OKR cascade (Sprint 0.8)", () => {
  let caller: any;
  let orgId: string;
  let ownerId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ownerId = seeded.adminId;
    caller = hrRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const mkObjective = (title: string, parentObjectiveId?: string | null) =>
    caller.okr.createObjective({ title, ownerId, cycle: "q1", year: YEAR, parentObjectiveId });

  it("creates an objective aligned to a parent", async () => {
    const parent = await mkObjective("Company: grow ARR");
    const child = await mkObjective("Team: ship billing", parent.id);
    expect(child.parentObjectiveId).toBe(parent.id);
  });

  it("rejects a parent objective from another org", async () => {
    const other = await seedFullOrg();
    const foreignCaller = hrRouter.createCaller(createMockContext(other.adminId, other.orgId));
    const foreign = await foreignCaller.okr.createObjective({
      title: "Foreign", ownerId: other.adminId, cycle: "q1", year: YEAR,
    });
    await expect(mkObjective("Mine", foreign.id)).rejects.toThrow(/not found/i);
  });

  it("setParent aligns and detaches", async () => {
    const parent = await mkObjective("Org objective");
    const child = await mkObjective("Individual objective");

    const aligned = await caller.okr.setParent({ id: child.id, parentObjectiveId: parent.id });
    expect(aligned.parentObjectiveId).toBe(parent.id);

    const detached = await caller.okr.setParent({ id: child.id, parentObjectiveId: null });
    expect(detached.parentObjectiveId).toBeNull();
  });

  it("rejects self-parenting and cycles", async () => {
    const a = await mkObjective("A");
    const b = await mkObjective("B", a.id); // b under a

    // self-parent
    await expect(caller.okr.setParent({ id: a.id, parentObjectiveId: a.id }))
      .rejects.toThrow(/its own parent/i);

    // cycle: making a a child of b (b is already a descendant of a)
    await expect(caller.okr.setParent({ id: a.id, parentObjectiveId: b.id }))
      .rejects.toThrow(/cycle/i);
  });

  it("cascade returns a forest with rolled-up progress", async () => {
    const org = await mkObjective("Org (0%)");
    const team = await mkObjective("Team (50%)", org.id);
    const person = await mkObjective("Person (100%)", team.id);

    const db = testDb();
    await db.update(okrObjectives).set({ overallProgress: 0 }).where(eq(okrObjectives.id, org.id));
    await db.update(okrObjectives).set({ overallProgress: 50 }).where(eq(okrObjectives.id, team.id));
    await db.update(okrObjectives).set({ overallProgress: 100 }).where(eq(okrObjectives.id, person.id));

    const { roots } = await caller.okr.cascade({ year: YEAR });
    expect(roots).toHaveLength(1);
    const root = roots[0];
    expect(root.objective.id).toBe(org.id);
    // rollup = avg(own 0, team 50, person 100) = 50
    expect(root.rollupProgress).toBe(50);
    // team node rollup = avg(50, 100) = 75
    expect(root.children[0].rollupProgress).toBe(75);
    // leaf rollup = own 100
    expect(root.children[0].children[0].rollupProgress).toBe(100);
  });

  it("orphans children when the parent objective is deleted (SET NULL)", async () => {
    const parent = await mkObjective("Parent");
    const child = await mkObjective("Child", parent.id);

    const db = testDb();
    await db.delete(okrObjectives).where(eq(okrObjectives.id, parent.id));

    const [row] = await db.select().from(okrObjectives).where(eq(okrObjectives.id, child.id));
    expect(row).toBeDefined();
    expect(row!.parentObjectiveId).toBeNull();
  });
});
