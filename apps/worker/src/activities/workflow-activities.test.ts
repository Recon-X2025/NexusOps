import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createActivities } from "./workflow-activities";

// DB-backed durability tests. Exercise the idempotency guarantees added in
// Phase 5: a Temporal retry of an already-completed activity must not duplicate
// step rows or re-run non-idempotent side effects (notifications/webhooks).

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";

let pool: Pool;
let acts: ReturnType<typeof createActivities>;
let orgId: string;
let userId: string;
let workflowId: string;
let versionId: string;
let runId: string;

async function newRun(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (workflow_id, workflow_version_id, status, started_at)
     VALUES ($1, $2, 'running', now()) RETURNING id`,
    [workflowId, versionId],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  acts = createActivities(pool);

  orgId = randomUUID();
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)`,
    [orgId, "Worker Durability Test", `worker-dur-${orgId.slice(0, 8)}`],
  );

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (org_id, email, name) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, `dur-${orgId.slice(0, 8)}@qa.test`, "Durability Bot"],
  );
  userId = u.rows[0]!.id;

  const wf = await pool.query<{ id: string }>(
    `INSERT INTO workflows (org_id, name, trigger_type, created_by_id)
     VALUES ($1, $2, 'manual', $3) RETURNING id`,
    [orgId, "Durability WF", userId],
  );
  workflowId = wf.rows[0]!.id;

  const ver = await pool.query<{ id: string }>(
    `INSERT INTO workflow_versions (workflow_id, version) VALUES ($1, 1) RETURNING id`,
    [workflowId],
  );
  versionId = ver.rows[0]!.id;
});

afterAll(async () => {
  if (pool) {
    // CASCADE removes workflows/versions/runs/step_runs/notifications for this org.
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await pool.end();
  }
});

beforeEach(async () => {
  runId = await newRun();
});

describe("workflow activity idempotency", () => {
  it("sendNotification creates exactly one step row and one notification across replays", async () => {
    const params = {
      orgId,
      runId,
      nodeId: "notify-1",
      data: { title: "Hi", message: "Once only", userId },
      context: { userId },
    };

    // Run three times, simulating Temporal retries of a completed activity.
    await acts.sendNotification(params);
    await acts.sendNotification(params);
    await acts.sendNotification(params);

    const steps = await pool.query<{ n: string; attempt_count: number; status: string }>(
      `SELECT count(*)::int AS n, max(attempt_count) AS attempt_count, max(status) AS status
       FROM workflow_step_runs WHERE run_id = $1 AND node_id = $2`,
      [runId, "notify-1"],
    );
    expect(steps.rows[0]!.n).toBe(1);
    expect(steps.rows[0]!.status).toBe("completed");
    // attempt_count is incremented on each replay (1 → 2 → 3).
    expect(steps.rows[0]!.attempt_count).toBe(3);

    const notes = await pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM notifications WHERE org_id = $1 AND title = 'Hi'`,
      [orgId],
    );
    expect(notes.rows[0]!.n).toBe(1);
  });

  it("evaluateCondition preserves its branching result on replay", async () => {
    const context: Record<string, unknown> = { priority: "high" };
    const params = {
      orgId,
      runId,
      nodeId: "cond-1",
      expression: "context.priority == 'high'",
      context,
    };

    await acts.evaluateCondition(params);
    expect(context["__cond_cond-1"]).toBe(true);

    // Replay into a fresh context object: result must be restored from storage.
    const replayContext: Record<string, unknown> = { priority: "high" };
    await acts.evaluateCondition({ ...params, context: replayContext });
    expect(replayContext["__cond_cond-1"]).toBe(true);

    const steps = await pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM workflow_step_runs WHERE run_id = $1 AND node_id = $2`,
      [runId, "cond-1"],
    );
    expect(steps.rows[0]!.n).toBe(1);
  });

  it("the unique (run_id, node_id) index rejects duplicate raw inserts", async () => {
    await pool.query(
      `INSERT INTO workflow_step_runs (run_id, node_id, node_type, status, attempt_count)
       VALUES ($1, 'dup', 'NOTIFY', 'running', 1)`,
      [runId],
    );
    await expect(
      pool.query(
        `INSERT INTO workflow_step_runs (run_id, node_id, node_type, status, attempt_count)
         VALUES ($1, 'dup', 'NOTIFY', 'running', 1)`,
        [runId],
      ),
    ).rejects.toMatchObject({ code: "23505" }); // unique_violation
  });
});
