/**
 * workflow-events.ts — In-process domain event bus for event-triggered workflows.
 *
 * The second dispatch path for the automation loop (the first being the
 * scheduled sweeper). Domain code emits a typed event (e.g. `ticket_created`);
 * this bus finds active `workflows` whose `triggerType` matches the event and
 * dispatches their action nodes via the entity-agnostic action runtime.
 *
 * This module wires the emitter. Invoking `emitDomainEvent` from the actual
 * entity create/update hooks (ticket/HR/asset/invoice/contract) is Sprint 3.3
 * and intentionally out of scope here — so no existing hook is touched yet.
 *
 * Also fans the event out to the outbound webhook dispatcher via
 * `enqueueWebhookEvent`, so a single domain event both runs internal workflows
 * and notifies external subscribers.
 *
 * Fire-and-forget: emission never throws into the caller's transaction. A
 * failed workflow action is logged, not propagated, so a domain mutation is
 * never rolled back by an automation side effect.
 */
import { and, eq } from "drizzle-orm";
import { workflows, workflowVersions } from "@coheronconnect/db";
import type { Db } from "@coheronconnect/db";
import { runWorkflowAction } from "../workflows/actions/runtime";
import { enqueueWebhookEvent } from "../workflows/webhookDispatchWorkflow";

/**
 * Event-triggered workflow trigger types. `scheduled`/`manual`/`webhook` are
 * excluded here — scheduled is handled by the sweeper, the others aren't
 * domain-event driven.
 */
export type DomainEventType =
  | "ticket_created"
  | "ticket_updated"
  | "status_changed";

export interface EmitDomainEventParams {
  orgId: string;
  type: DomainEventType;
  /** Arbitrary event context passed to actions and webhook subscribers. */
  payload: Record<string, unknown>;
  /**
   * Dotted event name for outbound webhooks (e.g. "ticket.created"). Defaults
   * to a dotted form of `type`. Set explicitly when the webhook event vocab
   * differs from the internal trigger enum.
   */
  webhookEvent?: string;
}

interface WorkflowNode {
  id: string;
  type: string;
  data: { name?: string; input?: Record<string, unknown> };
}

function extractActionNodes(
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
): Array<{ name: string; input: Record<string, unknown> }> {
  const out: Array<{ name: string; input: Record<string, unknown> }> = [];
  for (const n of nodes as WorkflowNode[]) {
    const name = typeof n.data?.name === "string" ? n.data.name : undefined;
    if (!name) continue;
    if (n.type !== "action" && n.type !== "run_workflow_action") continue;
    out.push({ name, input: (n.data?.input as Record<string, unknown>) ?? {} });
  }
  return out;
}

export interface EmitResult {
  workflowsMatched: number;
  actionsRun: number;
  errors: number;
}

/**
 * Emit a domain event: run matching event-triggered workflows and enqueue
 * outbound webhook deliveries. Never throws — returns a summary.
 */
export async function emitDomainEvent(
  db: Db,
  params: EmitDomainEventParams,
): Promise<EmitResult> {
  const result: EmitResult = { workflowsMatched: 0, actionsRun: 0, errors: 0 };

  // 1. Outbound webhooks — fan the event to external subscribers.
  const webhookEvent = params.webhookEvent ?? params.type.replace(/_/g, ".");
  try {
    await enqueueWebhookEvent(db, {
      orgId: params.orgId,
      event: webhookEvent,
      payload: params.payload,
    });
  } catch (err) {
    result.errors++;
    console.error("[workflow-events] webhook enqueue failed:", (err as Error).message);
  }

  // 2. Internal event-triggered workflows.
  try {
    const matched = await db
      .select({ id: workflows.id, currentVersion: workflows.currentVersion })
      .from(workflows)
      .where(
        and(
          eq(workflows.orgId, params.orgId),
          eq(workflows.isActive, true),
          eq(workflows.triggerType, params.type),
        ),
      );

    for (const wf of matched) {
      result.workflowsMatched++;
      const [version] = await db
        .select({ nodes: workflowVersions.nodes })
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, wf.id),
            eq(workflowVersions.version, wf.currentVersion),
          ),
        );
      const actions = extractActionNodes(version?.nodes ?? []);
      for (const a of actions) {
        const res = await runWorkflowAction({
          ctx: { db, orgId: params.orgId, actorId: "system" },
          name: a.name,
          input: { ...a.input, __event: params.payload },
        });
        result.actionsRun++;
        if (!res.ok) {
          result.errors++;
          console.warn(
            `[workflow-events] action '${a.name}' failed for workflow ${wf.id}:`,
            res.details,
          );
        }
      }
    }
  } catch (err) {
    result.errors++;
    console.error("[workflow-events] workflow dispatch failed:", (err as Error).message);
  }

  return result;
}
