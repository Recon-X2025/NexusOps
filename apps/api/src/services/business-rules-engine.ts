/**
 * Business rules engine — evaluates org rules on entity lifecycle events.
 *
 * Originally ticket-only; generalised (Sprint 3.3) to any first-class entity
 * (ticket, employee, asset, invoice, contract). The evaluator and the
 * `run_workflow_action` bridge were already entity-agnostic; the only
 * ticket-specific pieces are the `status_category_is` condition (tickets only)
 * and `{{ticket.*}}` templating, both retained for tickets via the
 * `runTicketBusinessRules` wrapper.
 *
 * v1 DSL: conditions (status category [ticket-only], field changed) + actions
 * (notify_user, notify_assignee, run_workflow_action).
 */
import { z } from "zod";
import { and, asc, eq, businessRules, ticketStatuses } from "@coheronconnect/db";
import { sendNotification } from "./notifications";
import { runWorkflowAction } from "../workflows/actions/runtime";

const EventSchema = z.enum(["created", "updated"]);
export const BusinessRuleEntitySchema = z.enum(["ticket", "employee", "asset", "invoice", "contract"]);
export type BusinessRuleEntity = z.infer<typeof BusinessRuleEntitySchema>;

/** Deep-link prefix per entity type; the entity id is appended (or a query). */
const ENTITY_LINK_PREFIX: Record<BusinessRuleEntity, string> = {
  ticket: "/app/tickets",
  employee: "/app/hr/employees",
  asset: "/app/assets",
  invoice: "/app/financial",
  contract: "/app/contracts",
};

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

/**
 * Generic `{{entity.<key>}}` substitution from a flat entity record. Missing
 * keys resolve to an empty string. Ticket rules use `templateTicket` instead so
 * existing `{{ticket.*}}` placeholders keep working unchanged.
 */
function templateEntity(text: string, entity: Record<string, unknown>): string {
  return text.replace(/\{\{\s*entity\.([\w]+)\s*\}\}/g, (_m, key: string) => {
    const v = entity[key];
    return v === undefined || v === null ? "" : String(v);
  });
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

/** Per-entity deep link. Tickets and most entities use `<prefix>/<id>`; the
 * finance surface (invoices) is a tabbed page, so link to the tab instead. */
function entityLink(entityType: BusinessRuleEntity, entity: Record<string, unknown>): string {
  const prefix = ENTITY_LINK_PREFIX[entityType];
  if (entityType === "invoice") return `${prefix}?tab=payables`;
  return `${prefix}/${entity.id}`;
}

async function executeAction(
  db: AnyDb,
  orgId: string,
  entityType: BusinessRuleEntity,
  action: z.infer<typeof ActionSchema>,
  entity: Record<string, unknown>,
): Promise<void> {
  const link = entityLink(entityType, entity);
  // Tickets retain `{{ticket.*}}` templating; other entities use `{{entity.*}}`.
  const tmpl = (text: string): string =>
    entityType === "ticket" ? templateTicket(text, entity) : templateEntity(text, entity);
  if (action.type === "notify_user") {
    await sendNotification({
      orgId,
      userId: action.userId,
      title: tmpl(action.title),
      body: tmpl(action.body),
      link,
      type: "info",
      sourceType: "business_rule",
      sourceId: String(entity.id),
    });
    return;
  }
  if (action.type === "notify_assignee") {
    const assigneeId = entity.assigneeId as string | null | undefined;
    if (!assigneeId) return;
    await sendNotification({
      orgId,
      userId: assigneeId,
      title: tmpl(action.title),
      body: tmpl(action.body),
      link,
      type: "info",
      sourceType: "business_rule",
      sourceId: String(entity.id),
    });
    return;
  }
  if (action.type === "run_workflow_action") {
    // Default-substitute the entity id into the conventional id slot if the
    // rule didn't override it. For tickets that's `ticketId` (keeps the common
    // escalate_on_sla_breach case ergonomic); other entities get `entityId`.
    const input: Record<string, unknown> = { ...action.input };
    if (entityType === "ticket") {
      if (input["ticketId"] === undefined) input["ticketId"] = entity.id;
    } else if (input["entityId"] === undefined) {
      input["entityId"] = entity.id;
    }
    await runWorkflowAction({
      ctx: { db, orgId, actorId: "system:business-rule" },
      name: action.name,
      input,
    });
  }
}

/**
 * Runs all matching enabled rules for an entity of `entityType`. Never throws
 * to callers — logs only, so a failing rule can never roll back the domain
 * mutation that triggered it.
 *
 * `status_category_is` conditions only apply to tickets (they require a ticket
 * status lookup); for non-ticket entities the status category is null, so such
 * a condition simply never matches. Non-ticket rules use the entity-agnostic
 * `field_changed` condition + `run_workflow_action`/notify actions.
 */
export async function runEntityBusinessRules(
  db: AnyDb,
  params: {
    orgId: string;
    entityType: BusinessRuleEntity;
    event: "created" | "updated";
    entity: Record<string, unknown>;
    changes: Record<string, { from: unknown; to: unknown }>;
  },
): Promise<void> {
  const { orgId, entityType, event, entity, changes } = params;
  const entityRec = entity as Record<string, unknown>;

  try {
    const rows = await db
      .select()
      .from(businessRules)
      .where(and(eq(businessRules.orgId, orgId), eq(businessRules.enabled, true), eq(businessRules.entityType, entityType)))
      .orderBy(asc(businessRules.priority), asc(businessRules.createdAt));

    // Ticket status category is only resolvable for tickets.
    const statusCategory =
      entityType === "ticket"
        ? await statusCategoryForTicket(db, orgId, (entityRec.statusId as string) ?? null)
        : null;

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
        await executeAction(db, orgId, entityType, action, entityRec).catch((err) =>
          console.error("[business-rules] Action failed", row.id, err),
        );
      }
    }
  } catch (e) {
    console.error("[business-rules] runEntityBusinessRules failed", e);
  }
}

/**
 * Runs all matching enabled ticket rules. Thin wrapper over
 * `runEntityBusinessRules` so the existing ticket call sites stay unchanged and
 * keep ticket status-category evaluation + `{{ticket.*}}` templating.
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
  return runEntityBusinessRules(db, {
    orgId: params.orgId,
    entityType: "ticket",
    event: params.event,
    entity: params.ticket,
    changes: params.changes,
  });
}
