/**
 * BLOCKER regression: writes to RLS-unprotected child tables must be scoped to
 * an org-owned parent.
 *
 * work_order_activity_logs / work_order_tasks and po_line_items carry no org_id,
 * so RLS cannot protect them. Two handlers wrote to them by a caller-supplied
 * child/parent id with no ownership check, letting one tenant delete or overwrite
 * another tenant's rows:
 *   • workOrders.delete    — deleted child rows by workOrderId before (and
 *                            regardless of) the org-scoped parent delete
 *   • purchaseOrders.receive — updated po_line_items by lineItemId with no PO/org
 *                            scoping
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initTestEnvironment, testDb, seedTestOrg, seedUser, makeContext } from "./helpers";
import { workOrdersRouter } from "../routers/work-orders";
import { procurementRouter } from "../routers/procurement";
import { workOrders, workOrderActivityLogs, purchaseOrders, poLineItems, vendors, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

beforeAll(async () => {
  await initTestEnvironment();
});

describe("cross-tenant child-table writes are refused (BLOCKER regression)", () => {
  it("workOrders.delete cannot erase another tenant's activity logs", async () => {
    const db = testDb();
    const a = await seedTestOrg();
    const { userId: uA } = await seedUser(a.orgId);
    const b = await seedTestOrg();
    const { userId: uB } = await seedUser(b.orgId);

    const [wo] = await db
      .insert(workOrders)
      .values({ orgId: a.orgId, number: `WO-${nanoid(5)}`, shortDescription: "A's work order" })
      .returning();
    const [log] = await db
      .insert(workOrderActivityLogs)
      .values({ workOrderId: wo!.id, userId: uA, action: "note", note: "A's private note" })
      .returning();

    // Attacker in org B passes A's work-order id.
    const bCaller = workOrdersRouter.createCaller(makeContext(uB, b.orgId));
    await expect(bCaller.delete({ id: wo!.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // A's activity log must still exist.
    const rows = await db.select().from(workOrderActivityLogs).where(eq(workOrderActivityLogs.id, log!.id));
    expect(rows.length).toBe(1);
  });

  it("purchaseOrders.receive cannot overwrite another tenant's line items", async () => {
    const db = testDb();
    const a = await seedTestOrg();
    const b = await seedTestOrg();
    const { userId: uB } = await seedUser(b.orgId);

    const [venA] = await db.insert(vendors).values({ orgId: a.orgId, name: "Vendor A" }).returning();
    const [venB] = await db.insert(vendors).values({ orgId: b.orgId, name: "Vendor B" }).returning();
    const [poA] = await db
      .insert(purchaseOrders)
      .values({ orgId: a.orgId, poNumber: `PO-A-${nanoid(4)}`, vendorId: venA!.id, totalAmount: "100" })
      .returning();
    const [lineA] = await db
      .insert(poLineItems)
      .values({ poId: poA!.id, description: "A's line", quantity: 10, receivedQuantity: 0 })
      .returning();
    const [poB] = await db
      .insert(purchaseOrders)
      .values({ orgId: b.orgId, poNumber: `PO-B-${nanoid(4)}`, vendorId: venB!.id, totalAmount: "100" })
      .returning();

    const bCaller = procurementRouter.createCaller(makeContext(uB, b.orgId));

    // Attack 1: receive on B's OWN po but reference A's line item — now rejected
    // explicitly (the line is not on this PO), where it used to silently no-op.
    await expect(
      bCaller.purchaseOrders.receive({ id: poB!.id, lineItems: [{ lineItemId: lineA!.id, receivedQty: 999 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const [after1] = await db.select().from(poLineItems).where(eq(poLineItems.id, lineA!.id));
    expect(after1!.receivedQuantity).toBe(0);

    // Attack 2: receive on A's po directly — must be refused before any write.
    await expect(
      bCaller.purchaseOrders.receive({ id: poA!.id, lineItems: [{ lineItemId: lineA!.id, receivedQty: 999 }] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [after2] = await db.select().from(poLineItems).where(eq(poLineItems.id, lineA!.id));
    expect(after2!.receivedQuantity).toBe(0);
  });

  it("purchaseOrders.receive rejects over-receipt beyond the ordered quantity (MED4)", async () => {
    const db = testDb();
    const a = await seedTestOrg();
    const { userId: uA } = await seedUser(a.orgId);
    const [ven] = await db.insert(vendors).values({ orgId: a.orgId, name: "Vendor" }).returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({ orgId: a.orgId, poNumber: `PO-${nanoid(4)}`, vendorId: ven!.id, totalAmount: "100" })
      .returning();
    const [line] = await db
      .insert(poLineItems)
      .values({ poId: po!.id, description: "Widgets", quantity: 5, receivedQuantity: 0 })
      .returning();

    const caller = procurementRouter.createCaller(makeContext(uA, a.orgId));

    // Over-receipt (6 > 5 ordered) is rejected and writes nothing.
    await expect(
      caller.purchaseOrders.receive({ id: po!.id, lineItems: [{ lineItemId: line!.id, receivedQty: 6 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const [afterReject] = await db.select().from(poLineItems).where(eq(poLineItems.id, line!.id));
    expect(afterReject!.receivedQuantity).toBe(0);

    // Receiving up to the ordered quantity succeeds and marks the PO received.
    const updated = await caller.purchaseOrders.receive({ id: po!.id, lineItems: [{ lineItemId: line!.id, receivedQty: 5 }] });
    expect(updated!.status).toBe("received");
    const [afterOk] = await db.select().from(poLineItems).where(eq(poLineItems.id, line!.id));
    expect(afterOk!.receivedQuantity).toBe(5);
  });
});
