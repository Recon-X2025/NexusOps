/**
 * Business rules engine — evaluates org rules on ticket lifecycle events.
 * v1 DSL: conditions (status category, field changed) + actions (notify_user, notify_assignee).
 */
import { z } from "zod";
import { and, asc, eq, businessRules, ticketStatuses } from "@nexusops/db";
import { sendNotification } from "./notifications";
import { runWorkflowAction } from "../workflows/actions/runtime";

const EventSchema = z.enum(["created", "updated"]);
export const BusinessRuleEntitySchema = z.literal("ticket");

export const ConditionSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("status_category_is"),
    category: z.enum(["open", "in_progress", "resolved", "closed"]),
  }),
  z.object({
    op: z.literal("field_changed"),
    field: z.string().min(1),
  }),
]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notify_user"),
    userId: z.string().uuid(),
    title: z.string().min(1).max(500),
    body: z.string().min(1).max(4000),
  }),
  z.object({
    type: z.literal("notify_assignee"),
    title: z.string().min(1).max(500),
    body: z.string().min(1).max(4000),
  }),
  /**
   * Bridge into the workflow-action library. The rules engine doesn't try to
   * type-check the action's input shape — that's the runtime's job. This is
   * the consumer-side hook that addresses market-assessment redo §C2 (the
   * actions library was previously dead code).
   */
  z.object({
    type: z.literal("run_workflow_action"),
    name: z.string().min(1).max(100),
    input: z.record(z.unknown()).default({}),
  }),
]);

export const BusinessRuleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  entityType: BusinessRuleEntitySchema,
  events: z.array(EventSchema).min(1),
  conditions: z.array(ConditionSchema),
  actions: z.array(ActionSchema).min(1),
  priority: z.number().int().min(0).max(999_999).default(100),
  enabled: z.boolean().default(true),
});

export type BusinessRuleCreateInput = z.infer<typeof BusinessRuleCreateSchema>;

/** Drizzle DB (same shape as ctx.db in routers). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function templateTicket(text: string, ticket: Record<string, unknown>): string {
  const num = String(ticket.number ?? "");
  const title = String(ticket.title ?? "");
  const id = String(ticket.id ?? "");
  return text
    .replace(/\{\{\s*ticket\.number\s*\}\}/g, num)
    .replace(/\{\{\s*ticket\.title\s*\}\}/g, title)
    .replace(/\{\{\s*ticket\.id\s*\}\}/g, id);
}

async function statusCategoryForTicket(
  db: AnyDb,
  orgId: string,
  statusId: string | null,
): Promise<string | null> {
  if (!statusId) return null;
  const [row] = await db
    .select({ category: ticketStatuses.category })
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.id, statusId), eq(ticketStatuses.orgId, orgId)))
    .limit(1);
  return row?.category ?? null;
}

function evaluateCondition(
  cond: z.infer<typeof ConditionSchema>,
  ctx: {
    orgId: string;
    event: "created" | "updated";
    changes: Record<string, { from: unknown; to: unknown }>;
    statusCategory: string | null;
  },
): boolean {
  if (cond.op === "status_category_is") {
    return ctx.statusCategory === cond.category;
  }
  if (cond.op === "field_changed") {
    return Object.prototype.hasOwnProperty.call(ctx.changes, cond.field);
  }
  return false;
}

async function executeAction(
  db: AnyDb,
  orgId: string,
  action: z.infer<typeof ActionSchema>,
  ticket: Record<string, unknown>,
): Promise<void> {
  const link = `/app/tickets/${ticket.id}`;
  if (action.type === "notify_user") {
    await sendNotification({
      orgId,
      userId: action.userId,
      title: templateTicket(action.title, ticket),
      body: templateTicket(action.body, ticket),
      link,
      type: "info",
      sourceType: "business_rule",
      sourceId: String(ticket.id),
    });
    return;
  }
  if (action.type === "notify_assignee") {
    const assigneeId = ticket.assigneeId as string | null | undefined;
    if (!assigneeId) return;
    await sendNotification({
      orgId,
      userId: assigneeId,
      title: templateTicket(action.title, ticket),
      body: templateTicket(action.body, ticket),
      link,
      type: "info",
      sourceType: "business_rule",
      sourceId: String(ticket.id),
    });
    return;
  }
  if (action.type === "run_workflow_action") {
    // Default-substitute {{ ticket.id }} into a `ticketId` slot if the action
    // schema asks for it and the rule didn't override. Keeps the common
    // case (escalate_on_sla_breach for the current ticket) ergonomic.
    const input: Record<string, unknown> = { ...action.input };
    if (input["ticketId"] === undefined) input["ticketId"] = ticket.id;
    await runWorkflowAction({
      ctx: { db, orgId, actorId: "system:business-rule" },
      name: action.name,
      input,
    });
  }
}

/**
 * Runs all matching enabled rules for a ticket. Never throws to callers — logs only.
 */
export async function runTicketBusinessRules(
  db: AnyDb,
  params: {
    orgId: string;
    event: "created" | "updated";
    ticket: Record<string, unknown>;
    changes: Record<string, { from: unknown; to: unknown }>;
  },
): Promise<void> {
  const { orgId, event, ticket, changes } = params;
  const ticketRec = ticket as Record<string, unknown>;

  try {
    const rows = await db
      .select()
      .from(businessRules)
      .where(and(eq(businessRules.orgId, orgId), eq(businessRules.enabled, true), eq(businessRules.entityType, "ticket")))
      .orderBy(asc(businessRules.priority), asc(businessRules.createdAt));

    const statusCategory = await statusCategoryForTicket(db, orgId, (ticketRec.statusId as string) ?? null);

    for (const row of rows) {
      const events = row.events as unknown;
      if (!Array.isArray(events) || !events.includes(event)) continue;

      const condParse = z.array(ConditionSchema).safeParse(row.conditions);
      const actParse = z.array(ActionSchema).safeParse(row.actions);
      if (!condParse.success || !actParse.success) {
        console.warn("[business-rules] Skipping rule — invalid DSL", row.id, condParse.error ?? actParse.error);
        continue;
      }

      const ctx = { orgId, event, changes, statusCategory };
      const allMatch = condParse.data.every((c) => evaluateCondition(c, ctx));
      if (!allMatch) continue;

      for (const action of actParse.data) {
        await executeAction(db, orgId, action, ticketRec).catch((err) =>
          console.error("[business-rules] Action failed", row.id, err),
        );
      }
    }
  } catch (e) {
    console.error("[business-rules] runTicketBusinessRules failed", e);
  }
}
