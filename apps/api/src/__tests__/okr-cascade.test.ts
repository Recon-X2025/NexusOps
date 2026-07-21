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

  // G12: drive own progress through the KR path (which persists the rollup)
  // rather than direct-mutating overallProgress. Sets an objective's own
  // progress to `pct` by adding a single KR at current=pct, target=100.
  const setOwnProgress = async (objectiveId: string, pct: number) => {
    const kr = await caller.okr.createKeyResult({ objectiveId, title: `kr-${pct}`, targetValue: 100 });
    await caller.okr.updateKeyResult({ id: kr.id, currentValue: pct });
  };

  it("cascade returns a forest with rolled-up progress", async () => {
    const org = await mkObjective("Org (0%)");
    const team = await mkObjective("Team (50%)", org.id);
    const person = await mkObjective("Person (100%)", team.id);

    await setOwnProgress(org.id, 0);
    await setOwnProgress(team.id, 50);
    await setOwnProgress(person.id, 100);

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

  it("G12: persists rollupProgress up the parent chain on a KR update", async () => {
    const org = await mkObjective("Org");
    const team = await mkObjective("Team", org.id);
    const person = await mkObjective("Person", team.id);

    await setOwnProgress(org.id, 0);
    await setOwnProgress(team.id, 50);
    await setOwnProgress(person.id, 100);

    const db = testDb();
    const read = async (id: string) =>
      (await db.select().from(okrObjectives).where(eq(okrObjectives.id, id)))[0]!;

    // Persisted rollup column (not the on-read view) reflects the whole chain.
    expect((await read(org.id)).rollupProgress).toBe(50); // avg(0,50,100)
    expect((await read(team.id)).rollupProgress).toBe(75); // avg(50,100)
    expect((await read(person.id)).rollupProgress).toBe(100); // leaf own
    // own progress stays own-KR-derived, distinct from rollup.
    expect((await read(org.id)).overallProgress).toBe(0);
  });

  it("G12: a leaf KR change re-persists every ancestor's rollup", async () => {
    const org = await mkObjective("Org");
    const team = await mkObjective("Team", org.id);
    const person = await mkObjective("Person", team.id);

    await setOwnProgress(org.id, 0);
    await setOwnProgress(team.id, 0);
    const leafKr = await caller.okr.createKeyResult({ objectiveId: person.id, title: "leaf", targetValue: 100 });
    await caller.okr.updateKeyResult({ id: leafKr.id, currentValue: 0 });

    const db = testDb();
    const read = async (id: string) =>
      (await db.select().from(okrObjectives).where(eq(okrObjectives.id, id)))[0]!;
    expect((await read(org.id)).rollupProgress).toBe(0);

    // Bump only the leaf; ancestors must re-roll: avg(0,0,60)=20 at org.
    await caller.okr.updateKeyResult({ id: leafKr.id, currentValue: 60 });
    expect((await read(org.id)).rollupProgress).toBe(20); // avg(0,0,60)
    expect((await read(team.id)).rollupProgress).toBe(30); // avg(0,60)
    expect((await read(person.id)).rollupProgress).toBe(60);
  });

  it("G12: persisted rollup matches the on-read cascade value", async () => {
    const org = await mkObjective("Org");
    const team = await mkObjective("Team", org.id);
    await setOwnProgress(org.id, 20);
    await setOwnProgress(team.id, 80);

    const db = testDb();
    const orgRow = (await db.select().from(okrObjectives).where(eq(okrObjectives.id, org.id)))[0]!;
    const { roots } = await caller.okr.cascade({ year: YEAR });
    // cascade now surfaces the persisted column verbatim.
    expect(roots[0].rollupProgress).toBe(orgRow.rollupProgress);
    expect(roots[0].rollupProgress).toBe(50); // avg(20,80)
  });

  it("G12: re-parenting re-persists the rollup on both trees", async () => {
    const orgA = await mkObjective("Org A");
    const orgB = await mkObjective("Org B");
    const child = await mkObjective("Child", orgA.id);
    await setOwnProgress(orgA.id, 0);
    await setOwnProgress(orgB.id, 0);
    await setOwnProgress(child.id, 100);

    const db = testDb();
    const read = async (id: string) =>
      (await db.select().from(okrObjectives).where(eq(okrObjectives.id, id)))[0]!;
    expect((await read(orgA.id)).rollupProgress).toBe(50); // avg(0,100)
    expect((await read(orgB.id)).rollupProgress).toBe(0);

    // Move child from A to B.
    await caller.okr.setParent({ id: child.id, parentObjectiveId: orgB.id });
    expect((await read(orgA.id)).rollupProgress).toBe(0); // child gone
    expect((await read(orgB.id)).rollupProgress).toBe(50); // now includes child
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
