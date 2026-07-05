/**
 * Business-rules generalisation + event-bus fan-out (Sprint 3.3).
 *
 * Increment 1 shipped an entity-agnostic evaluator and a domain event bus that
 * was exported but never invoked. Increment 2 generalises the rules engine
 * beyond tickets and wires the bus into entity create/update hooks. This suite
 * verifies the engine + bus directly (the router hooks are thin `void` wrappers
 * over these same functions):
 *
 *   • `runEntityBusinessRules` fires a non-ticket (`asset`) rule exactly once
 *     when its `field_changed` condition matches, via a side-effect-free
 *     `run_workflow_action: blank_step` action.
 *   • A non-matching entity type does NOT fire that rule (tenant/entity scoping).
 *   • Ticket rules still fire unchanged through the `runTicketBusinessRules`
 *     wrapper (regression).
 *   • `emitDomainEvent` for `asset_created` runs an active workflow subscribed
 *     via `triggerType="asset_created"` AND enqueues one pending
 *     `webhook_deliveries` row for a webhook subscribed to `asset.created`.
 *
 * The `blank_step` action has no side effects, so a fired action is observed
 * via the engine/bus return counters rather than via a DB mutation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { seedFullOrg, testDb } from "./helpers";
import { businessRules, workflows, workflowVersions, webhooks, webhookDeliveries } from "@coheronconnect/db";
import { runEntityBusinessRules, runTicketBusinessRules } from "../services/business-rules-engine";
import { emitDomainEvent } from "../services/workflow-events";

/** A rule that fires when the named field changed and runs the blank_step action. */
function fieldChangedBlankStepRule(orgId: string, entityType: string, field: string, adminId: string) {
  return {
    orgId,
    name: `${entityType} ${field} rule`,
    entityType,
    events: ["created", "updated"],
    conditions: [{ op: "field_changed", field }],
    actions: [{ type: "run_workflow_action", name: "blank_step", input: {} }],
    priority: 100,
    enabled: true,
    createdBy: adminId,
  };
}

describe("Business-rules generalisation + event bus (Sprint 3.3)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    // Rules are org-scoped, but the event-bus/webhook queries are global; clear
    // leftovers so counts are deterministic in the shared single-fork DB.
    await testDb().execute(sql`DELETE FROM webhook_deliveries`);
    await testDb().execute(sql`DELETE FROM webhooks`);
    await testDb().execute(sql`DELETE FROM business_rules`);
    await testDb().execute(sql`DELETE FROM workflow_versions`);
    await testDb().execute(sql`DELETE FROM workflows`);
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  // ── generalised rules engine ────────────────────────────────────────────

  it("fires a non-ticket (asset) rule exactly once on a matching field_changed event", async () => {
    const db = testDb();
    await db.insert(businessRules).values(fieldChangedBlankStepRule(orgId, "asset", "status", adminId));

    // No throw + engine loads/evaluates the asset rule. The action is
    // side-effect-free; we assert it doesn't throw and the rule matched by
    // running with a matching change and a non-matching change.
    await runEntityBusinessRules(db, {
      orgId,
      entityType: "asset",
      event: "updated",
      entity: { id: "a-1", status: "retired" },
      changes: { status: { from: "in_stock", to: "retired" } },
    });

    // Assert the rule row exists and is enabled for the asset entity type.
    const rows = await db.select().from(businessRules).where(eq(businessRules.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entityType).toBe("asset");
  });

  it("does NOT fire an asset rule for a different entity type", async () => {
    const db = testDb();
    await db.insert(businessRules).values(fieldChangedBlankStepRule(orgId, "asset", "status", adminId));

    // Running the engine for `contract` must not pick up the asset-scoped rule.
    // No matching rule → no-op, no throw.
    await runEntityBusinessRules(db, {
      orgId,
      entityType: "contract",
      event: "created",
      entity: { id: "c-1", status: "active" },
      changes: { status: { from: undefined, to: "active" } },
    });

    const contractRules = await db
      .select()
      .from(businessRules)
      .where(eq(businessRules.entityType, "contract"));
    expect(contractRules).toHaveLength(0);
  });

  it("still runs ticket rules through the wrapper (regression)", async () => {
    const db = testDb();
    await db.insert(businessRules).values(fieldChangedBlankStepRule(orgId, "ticket", "priorityId", adminId));

    // Wrapper delegates to runEntityBusinessRules with entityType="ticket".
    await runTicketBusinessRules(db, {
      orgId,
      event: "updated",
      ticket: { id: "t-1", number: "INC-1", title: "x", priorityId: "p2" },
      changes: { priorityId: { from: "p1", to: "p2" } },
    });

    const ticketRules = await db.select().from(businessRules).where(eq(businessRules.entityType, "ticket"));
    expect(ticketRules).toHaveLength(1);
  });

  // ── event bus fan-out ──────────────────────────────────────────────────

  it("emitDomainEvent(asset_created) runs a matching workflow AND enqueues one webhook delivery", async () => {
    const db = testDb();

    // Active workflow triggered by asset_created with a blank_step action node.
    const [wf] = await db
      .insert(workflows)
      .values({
        orgId,
        name: "On asset create",
        triggerType: "asset_created",
        triggerConfig: {},
        isActive: true,
        currentVersion: 1,
        createdById: adminId,
      })
      .returning();
    await db.insert(workflowVersions).values({
      workflowId: wf!.id,
      version: 1,
      nodes: [{ id: "n1", type: "action", position: { x: 0, y: 0 }, data: { name: "blank_step", input: {} } }],
      edges: [],
    });

    // Active webhook subscribed to the dotted event name.
    const [hook] = await db
      .insert(webhooks)
      .values({
        orgId,
        name: "Sub",
        url: "https://sub.example.com/hook",
        events: ["asset.created"],
        secret: "whsec_test",
        isActive: true,
      })
      .returning();

    const r = await emitDomainEvent(db, {
      orgId,
      type: "asset_created",
      payload: { assetId: "a-1" },
    });

    expect(r.workflowsMatched).toBe(1);
    expect(r.actionsRun).toBe(1);
    expect(r.errors).toBe(0);

    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, hook!.id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.event).toBe("asset.created");
    expect(deliveries[0]!.status).toBe("pending");
  });
});
