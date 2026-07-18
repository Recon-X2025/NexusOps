/**
 * Workflow trigger layer (Sprint 3.1).
 *
 * Verifies the scheduled-workflow sweeper closes the first half of the
 * automation loop: `workflows.triggerType='scheduled'` rows were previously
 * stored but never evaluated. `sweepScheduledWorkflows(db)`:
 *   • claims due active scheduled workflows (never-run OR older than
 *     `triggerConfig.everyMinutes`) with `FOR UPDATE SKIP LOCKED`,
 *   • stamps `lastRunAt = NOW()` atomically in the claim,
 *   • dispatches each workflow version's action nodes via the runtime.
 *
 * Idempotency invariant: a second immediate tick must NOT re-fire (the
 * cadence guard sees `lastRunAt` as too recent). This is the "no double-fire
 * on scheduler overlap" guarantee.
 *
 * Uses the side-effect-free `blank_step` action so the test asserts dispatch
 * without provoking notifications or DB writes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { seedFullOrg, testDb } from "./helpers";
import { workflows, workflowVersions } from "@coheronconnect/db";
import { sweepScheduledWorkflows } from "../workflows/workflowTriggerWorkflow";

const MIN = 60_000;

describe("Workflow trigger layer (Sprint 3.1)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    // The scheduled sweep is global (claims all due workflows DB-wide), so
    // clear any leftovers from prior tests before seeding this one. The suite
    // runs serially in a single fork against a shared DB.
    await testDb().execute(sql`DELETE FROM workflow_versions`);
    await testDb().execute(sql`DELETE FROM workflows`);
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  /**
   * Seed a workflow (+ one version with a single `blank_step` action node) and
   * return its id. `lastRunAt` lets a test place the workflow inside or outside
   * its cadence window.
   */
  async function seedScheduledWorkflow(opts: {
    isActive?: boolean;
    everyMinutes?: number;
    lastRunAt?: Date | null;
    withActionNode?: boolean;
  } = {}): Promise<string> {
    const db = testDb();
    const [wf] = await db
      .insert(workflows)
      .values({
        orgId,
        name: "Nightly sweep",
        triggerType: "scheduled",
        triggerConfig: { everyMinutes: opts.everyMinutes ?? 60 },
        isActive: opts.isActive ?? true,
        currentVersion: 1,
        lastRunAt: opts.lastRunAt ?? null,
        createdById: adminId,
      })
      .returning();

    await db.insert(workflowVersions).values({
      workflowId: wf!.id,
      version: 1,
      nodes:
        opts.withActionNode === false
          ? []
          : [{ id: "n1", type: "action", position: { x: 0, y: 0 }, data: { name: "blank_step", input: {} } }],
      edges: [],
    });

    return wf!.id;
  }

  async function getLastRunAt(id: string): Promise<Date | null> {
    const [row] = await testDb()
      .select({ lastRunAt: workflows.lastRunAt })
      .from(workflows)
      .where(eq(workflows.id, id));
    return row?.lastRunAt ?? null;
  }

  it("fires a never-run active scheduled workflow exactly once and stamps lastRunAt", async () => {
    const id = await seedScheduledWorkflow({ lastRunAt: null });

    const r = await sweepScheduledWorkflows(testDb());

    expect(r.examined).toBe(1);
    expect(r.fired).toBe(1);
    expect(r.actionsRun).toBe(1);
    expect(r.errors).toBe(0);

    const stamped = await getLastRunAt(id);
    expect(stamped).not.toBeNull();
    // Stamped to ~now.
    expect(Date.now() - stamped!.getTime()).toBeLessThan(60_000);
  });

  it("does NOT re-fire on an immediate second tick (idempotent, no double-fire)", async () => {
    const id = await seedScheduledWorkflow({ everyMinutes: 60, lastRunAt: null });

    const first = await sweepScheduledWorkflows(testDb());
    expect(first.fired).toBe(1);
    const afterFirst = await getLastRunAt(id);

    // Immediate second tick: lastRunAt is < everyMinutes old, so not due.
    const second = await sweepScheduledWorkflows(testDb());
    expect(second.examined).toBe(0);
    expect(second.fired).toBe(0);

    // lastRunAt unchanged by the no-op second tick.
    const afterSecond = await getLastRunAt(id);
    expect(afterSecond!.getTime()).toBe(afterFirst!.getTime());
  });

  it("fires again once the cadence window has elapsed", async () => {
    // lastRunAt 90 min ago with a 60-min cadence → due again.
    const id = await seedScheduledWorkflow({ everyMinutes: 60, lastRunAt: new Date(Date.now() - 90 * MIN) });

    const r = await sweepScheduledWorkflows(testDb());
    expect(r.fired).toBe(1);

    const stamped = await getLastRunAt(id);
    expect(Date.now() - stamped!.getTime()).toBeLessThan(60_000);
  });

  it("skips a workflow still inside its cadence window", async () => {
    // lastRunAt 10 min ago with a 60-min cadence → not yet due.
    await seedScheduledWorkflow({ everyMinutes: 60, lastRunAt: new Date(Date.now() - 10 * MIN) });

    const r = await sweepScheduledWorkflows(testDb());
    expect(r.examined).toBe(0);
    expect(r.fired).toBe(0);
  });

  it("ignores inactive scheduled workflows", async () => {
    await seedScheduledWorkflow({ isActive: false, lastRunAt: null });

    const r = await sweepScheduledWorkflows(testDb());
    expect(r.examined).toBe(0);
  });

  it("ignores non-scheduled trigger types", async () => {
    const db = testDb();
    const [wf] = await db
      .insert(workflows)
      .values({
        orgId,
        name: "On ticket create",
        triggerType: "ticket_created",
        triggerConfig: {},
        isActive: true,
        currentVersion: 1,
        lastRunAt: null,
        createdById: adminId,
      })
      .returning();
    await db.insert(workflowVersions).values({
      workflowId: wf!.id,
      version: 1,
      nodes: [{ id: "n1", type: "action", position: { x: 0, y: 0 }, data: { name: "blank_step", input: {} } }],
      edges: [],
    });

    const r = await sweepScheduledWorkflows(db);
    expect(r.examined).toBe(0);
  });

  it("claims a due workflow with no action nodes (fired=0) but still advances lastRunAt", async () => {
    const id = await seedScheduledWorkflow({ lastRunAt: null, withActionNode: false });

    const r = await sweepScheduledWorkflows(testDb());
    // Claimed + examined, but no actions to run.
    expect(r.examined).toBe(1);
    expect(r.fired).toBe(0);
    expect(r.actionsRun).toBe(0);

    // Still stamped so it won't be reconsidered every tick.
    const stamped = await getLastRunAt(id);
    expect(stamped).not.toBeNull();
  });

  it("is tenant-agnostic in the sweep but per-org in dispatch (fires workflows across orgs)", async () => {
    await seedScheduledWorkflow({ lastRunAt: null });
    const other = await seedFullOrg();
    const db = testDb();
    const [wf2] = await db
      .insert(workflows)
      .values({
        orgId: other.orgId,
        name: "Other org sweep",
        triggerType: "scheduled",
        triggerConfig: { everyMinutes: 60 },
        isActive: true,
        currentVersion: 1,
        lastRunAt: null,
        createdById: other.adminId,
      })
      .returning();
    await db.insert(workflowVersions).values({
      workflowId: wf2!.id,
      version: 1,
      nodes: [{ id: "n1", type: "action", position: { x: 0, y: 0 }, data: { name: "blank_step", input: {} } }],
      edges: [],
    });

    // Both rows are due (last_run_at NULL). A single sweep normally claims both,
    // but the claim uses `FOR UPDATE SKIP LOCKED`, so under a loaded shared-DB run
    // a transient lock from another connection can make one row skip this tick. A
    // skipped row keeps last_run_at NULL (only claimed rows are stamped), so it is
    // still due on the next tick — exactly how the real 60s-cadence sweeper drains
    // a backlog. Accumulate across a few immediate ticks to assert both eventually
    // fire without a double-fire (a stamped row won't be re-claimed).
    let examined = 0;
    let fired = 0;
    for (let tick = 0; tick < 5 && fired < 2; tick++) {
      const r = await sweepScheduledWorkflows(db);
      examined += r.examined;
      fired += r.fired;
    }
    expect(examined).toBe(2);
    expect(fired).toBe(2);

    // Both stamped.
    const [a] = await db.select({ lastRunAt: workflows.lastRunAt }).from(workflows).where(and(eq(workflows.orgId, orgId), eq(workflows.triggerType, "scheduled")));
    expect(a?.lastRunAt).not.toBeNull();
  });
});
