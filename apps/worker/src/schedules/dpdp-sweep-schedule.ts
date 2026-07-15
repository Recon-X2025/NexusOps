/**
 * DPDP sweep schedule registration (Phase 1 — scheduler harness, B1).
 *
 * Registers (or updates) a Temporal Schedule that fires `dpdpSweepWorkflow` on
 * a recurring cadence. Idempotent: if the schedule already exists we leave it
 * in place (create throws ScheduleAlreadyRunning / already-exists, which we
 * swallow). Cadence is env-configurable via DPDP_SWEEP_INTERVAL (default 1h).
 */
import { Client, type Connection, ScheduleOverlapPolicy } from "@temporalio/client";

const SCHEDULE_ID = "dpdp-sweep-schedule";
const WORKFLOW_TYPE = "dpdpSweepWorkflow";
const TASK_QUEUE = "coheronconnect-workflow";

/**
 * Parse a simple `<n><unit>` interval string (e.g. "1h", "30m", "15s") into
 * milliseconds. Temporal's Duration accepts a number of milliseconds, which
 * sidesteps the template-literal `StringValue` type on env-sourced strings.
 * Unknown/invalid input falls back to 1 hour.
 */
function parseIntervalMs(raw: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(raw.trim());
  if (!m) return 60 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2]) {
    case "ms": return n;
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

export async function registerDpdpSweepSchedule(connection: Connection): Promise<void> {
  const rawInterval = process.env["DPDP_SWEEP_INTERVAL"] ?? "1h";
  const intervalMs = parseIntervalMs(rawInterval);
  const client = new Client({ connection });

  try {
    await client.schedule.create({
      scheduleId: SCHEDULE_ID,
      spec: { intervals: [{ every: intervalMs }] },
      action: {
        type: "startWorkflow",
        workflowType: WORKFLOW_TYPE,
        taskQueue: TASK_QUEUE,
        args: [{}],
      },
      policies: {
        // Never run two sweeps concurrently; skip a tick if the previous one is
        // still running. The sweeps are idempotent, so skipping is harmless.
        overlap: ScheduleOverlapPolicy.SKIP,
      },
    });
    console.log(`[worker] DPDP sweep schedule registered (every ${rawInterval} = ${intervalMs}ms)`);
  } catch (err) {
    // Already exists — a prior worker start created it. Leave it untouched.
    const msg = err instanceof Error ? err.message : String(err);
    if (/already/i.test(msg)) {
      console.log(`[worker] DPDP sweep schedule already exists — leaving in place`);
      return;
    }
    throw err;
  }
}
