/**
 * Workflow-action runtime — single dispatch point for executing a named
 * action from `apps/api/src/workflows/actions/`.
 *
 * Consumers:
 *   1. `services/business-rules-engine.ts` — the `run_workflow_action`
 *      action variant; lets ticket lifecycle rules invoke any registered
 *      action by name with declarative input.
 *   2. `routers/workflows.ts` — exposes `listAvailableActions` and
 *      `runActionNow` so the visual workflow designer can render the action
 *      palette and operators can canary-test before wiring into a rule.
 *
 * Telemetry is kept lightweight: console + return value. The caller is
 * responsible for persisting step results into `workflow_step_runs` if
 * invoked from a Temporal activity.
 */
import type { ActionContext, WorkflowActionResult } from "./types";
import { getWorkflowAction, listWorkflowActions } from "./index";

export interface RunActionParams {
  ctx: ActionContext;
  name: string;
  input: Record<string, unknown>;
}

export async function runWorkflowAction(
  params: RunActionParams,
): Promise<WorkflowActionResult> {
  const action = getWorkflowAction(params.name);
  if (!action) {
    return { ok: false, details: `Workflow action '${params.name}' is not registered` };
  }

  const missing = action.inputs
    .filter((f) => f.required && (params.input[f.key] === undefined || params.input[f.key] === null || params.input[f.key] === ""))
    .map((f) => f.key);
  if (missing.length > 0) {
    return { ok: false, details: `Missing required input(s): ${missing.join(", ")}` };
  }

  try {
    const result = await action.handler(params.ctx, params.input as never);
    if (!result.ok) {
      console.warn("[workflow-action] failed", { name: params.name, orgId: params.ctx.orgId, details: result.details });
    }
    return result;
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    console.error("[workflow-action] threw", { name: params.name, orgId: params.ctx.orgId, error: msg });
    return { ok: false, details: msg };
  }
}

export { listWorkflowActions, getWorkflowAction };
