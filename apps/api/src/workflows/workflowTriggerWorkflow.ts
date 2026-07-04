/**
 * workflowTriggerWorkflow.ts — Scheduled-workflow trigger sweeper.
 *
 * Closes the automation loop's first half: the `workflows.triggerType`
 * enum was previously stored but never evaluated, so `scheduled` workflows
 * never ran. This sweeper polls for active scheduled workflows whose cadence
 * has elapsed since `lastRunAt`, dispatches each workflow's action nodes via
 * the existing entity-agnostic action runtime, and stamps `lastRunAt`.
 *
 * Schedule model: `triggerConfig.everyMinutes` (number, default 60). A
 * workflow is "due" when `lastRunAt` is null (never run) or older than
 * `everyMinutes` ago. Cron-style schedules are a later enhancement.
 *
 * Idempotency: the due-set query claims rows with `FOR UPDATE SKIP LOCKED`
 * and re-checks the `lastRunAt` guard, so overlapping sweep ticks (or a slow
 * tick colliding with the next) can never double-fire a workflow.
 *
 * Schedule: BullMQ repeatable job, every 60s (mirrors the SLA sweeper).
 */
import { Queue, Worker, type Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { workflows, workflowVersions } from "@coheronconnect/db";
import type { Db } from "@coheronconnect/db";
import { runWorkflowAction } from "./actions/runtime";

function redisConnection() {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return { url };
}

export interface WorkflowTriggerJobData {
  /** Unused for the sweep; payload-less like the SLA sweeper. */
  _sweep?: true;
}

export const WORKFLOW_TRIGGER_QUEUE_NAME = "coheronconnect-workflow-trigger";
export const WORKFLOW_TRIGGER_SWEEP_JOB_NAME = "sweep";
/** 60s cadence — matches the SLA sweeper. */
const SWEEP_INTERVAL_MS = 60_000;
/** Cap workflows evaluated per tick so a single sweep can't monopolise the DB. */
const SWEEP_BATCH_LIMIT = 100;
const DEFAULT_EVERY_MINUTES = 60;

let _queue: Queue<WorkflowTriggerJobData> | null = null;

export function createWorkflowTriggerQueue(): Queue<WorkflowTriggerJobData> {
  if (_queue) return _queue;
  _queue = new Queue<WorkflowTriggerJobData>(WORKFLOW_TRIGGER_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
  return _queue;
}

/**
 * Register the repeatable sweep. BullMQ dedupes repeatable jobs by
 * (name, repeat options), so calling on every server boot is idempotent.
 */
export async function scheduleWorkflowTriggerSweep(
  queue: Queue<WorkflowTriggerJobData>,
): Promise<void> {
  await queue.add(
    WORKFLOW_TRIGGER_SWEEP_JOB_NAME,
    {},
    {
      repeat: { every: SWEEP_INTERVAL_MS },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}

interface WorkflowNodeData {
  name?: string;
  input?: Record<string, unknown>;
}
interface WorkflowNode {
  id: string;
  type: string;
  data: WorkflowNodeData;
}

/** An action node carries an action `name` (+ optional `input`) in its data. */
function extractActionNodes(
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
): Array<{ name: string; input: Record<string, unknown> }> {
  const out: Array<{ name: string; input: Record<string, unknown> }> = [];
  for (const n of nodes as WorkflowNode[]) {
    // Accept either an explicit `action`-typed node or any node whose data
    // names a registered action; the runtime rejects unknown names safely.
    const name = typeof n.data?.name === "string" ? n.data.name : undefined;
    if (!name) continue;
    if (n.type !== "action" && n.type !== "run_workflow_action") continue;
    out.push({ name, input: (n.data?.input as Record<string, unknown>) ?? {} });
  }
  return out;
}

export interface WorkflowTriggerSweepResult {
  examined: number;
  fired: number;
  actionsRun: number;
  errors: number;
}

/**
 * Core sweep. Exported so admin endpoints and tests can invoke it directly
 * without touching Redis/BullMQ.
 *
 * The claim query selects due scheduled workflows and immediately stamps
 * `lastRunAt = NOW()` inside a `FOR UPDATE SKIP LOCKED` CTE, so a workflow
 * is atomically claimed by exactly one sweep before any action fires.
 */
export async function sweepScheduledWorkflows(db: Db): Promise<WorkflowTriggerSweepResult> {
  const result: WorkflowTriggerSweepResult = { examined: 0, fired: 0, actionsRun: 0, errors: 0 };

  // Atomically claim due workflows: never run, or last run older than the
  // configured cadence. Stamp lastRunAt in the same statement so a concurrent
  // tick sees them as no-longer-due. Returns the claimed rows to act on.
  const claimed = await db.execute(sql`
    WITH due AS (
      SELECT w.id
      FROM ${workflows} w
      WHERE w.is_active = true
        AND w.trigger_type = 'scheduled'
        AND (
          w.last_run_at IS NULL
          OR w.last_run_at < NOW() - (
            COALESCE((w.trigger_config->>'everyMinutes')::int, ${DEFAULT_EVERY_MINUTES})
            * interval '1 minute'
          )
        )
      ORDER BY w.last_run_at NULLS FIRST
      LIMIT ${SWEEP_BATCH_LIMIT}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${workflows} w
    SET    last_run_at = NOW()
    FROM   due
    WHERE  w.id = due.id
    RETURNING w.id, w.org_id, w.current_version
  `);

  const rows = (Array.isArray(claimed) ? claimed : ((claimed as { rows?: unknown[] }).rows ?? [])) as Array<{
    id: string;
    org_id: string;
    current_version: number;
  }>;

  for (const wf of rows) {
    result.examined++;
    try {
      const [version] = await db
        .select({ nodes: workflowVersions.nodes })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, wf.id),
            eq(workflowVersions.version, wf.current_version),
          ),
        );

      const actions = extractActionNodes(version?.nodes ?? []);
      if (actions.length === 0) continue;

      result.fired++;
      for (const a of actions) {
        const res = await runWorkflowAction({
          ctx: { db, orgId: wf.org_id, actorId: "system" },
          name: a.name,
          input: a.input,
        });
        result.actionsRun++;
        if (!res.ok) {
          result.errors++;
          console.warn(
            `[workflow-trigger] action '${a.name}' failed for workflow ${wf.id}:`,
            res.details,
          );
        }
      }
    } catch (err) {
      result.errors++;
      console.error(
        `[workflow-trigger] sweep failed for workflow ${wf.id}:`,
        (err as Error).message,
      );
    }
  }

  return result;
}

export function startWorkflowTriggerWorker(db: Db): Worker<WorkflowTriggerJobData> {
  const worker = new Worker<WorkflowTriggerJobData>(
    WORKFLOW_TRIGGER_QUEUE_NAME,
    async (job: Job<WorkflowTriggerJobData>) => {
      if (job.name !== WORKFLOW_TRIGGER_SWEEP_JOB_NAME) return;
      const t0 = Date.now();
      const r = await sweepScheduledWorkflows(db);
      if (r.fired > 0 || r.errors > 0) {
        console.info(
          `[workflow-trigger] sweep in ${Date.now() - t0}ms — examined=${r.examined} ` +
            `fired=${r.fired} actionsRun=${r.actionsRun} errors=${r.errors}`,
        );
      }
      return r;
    },
    { connection: redisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[workflow-trigger] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
