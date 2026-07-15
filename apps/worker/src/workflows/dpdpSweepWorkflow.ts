/**
 * DPDP sweep workflow (Phase 1 — scheduler harness, B1).
 *
 * A deliberately minimal workflow: it invokes the single `runDpdpSweeps`
 * activity and returns its result. It carries no branching or state of its own
 * — all sweep logic lives behind the internal API endpoint the activity calls.
 * A Temporal Schedule (see registerDpdpSweepSchedule) drives it on a cadence.
 */
import { proxyActivities } from "@temporalio/workflow";
import type { DpdpSweepActivities, DpdpSweepActivityResult } from "../activities/dpdp-sweep-activities";

const { runDpdpSweeps } = proxyActivities<DpdpSweepActivities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumInterval: "2 minutes",
    maximumAttempts: 5,
  },
});

export async function dpdpSweepWorkflow(input?: { orgId?: string }): Promise<DpdpSweepActivityResult> {
  return runDpdpSweeps(input);
}
