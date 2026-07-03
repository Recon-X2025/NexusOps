/**
 * Inventory valuation router tests (Sprint 2.4).
 *
 * The inventory router gains a costed `valuation` sub-router that wires the
 * pure-math FIFO/WAC engine in @coheronconnect/payroll-math:
 *   - setMethod : pick FIFO or WAC (only while the item carries no stock)
 *   - intake    : add qty at a purchase unit cost, updating valuation state
 *   - issue     : consume qty and expense COGS (FIFO layers or WAC average)
 *   - layers    : the FIFO cost-layer stack for one item
 *   - report    : per-item book value + org total stock value
 *
 * Verifies FIFO COGS = oldest-cost-first, WAC COGS = running average, book-value
 * roll-forward, insufficient-stock guard, tenant isolation and RBAC.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { inventoryRouter } from "../routers/inventory";
import { inventoryItems } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Inventory valuation (Sprint 2.4)", () => {
  let caller: any;
  let orgId: string;
  let adminId: string;

  /** Seed a zero-stock item with a chosen valuation method; returns its id. */
  async function seedItem(method: "FIFO" | "WAC"): Promise<string> {
    const [item] = await testDb()
      .insert(inventoryItems)
      .values({
        orgId,
        partNumber: `PN-${nanoid(6)}`,
        name: "Widget",
        valuationMethod: method,
      })
      .returning();
    return item!.id;
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = inventoryRouter.createCaller(createMockContext(adminId, orgId));
  });

  // ── FIFO ────────────────────────────────────────────────────────────────────
  it("expenses FIFO COGS oldest-cost-first across layers", async () => {
    const itemId = await seedItem("FIFO");
    await caller.valuation.intake({ itemId, qty: 10, unitCost: 100 });
    await caller.valuation.intake({ itemId, qty: 10, unitCost: 120 });

    // Issue 15: 10@100 + 5@120 = 1000 + 600 = 1600.
    const res = await caller.valuation.issue({ itemId, qty: 15 });
    expect(res.cogs).toBe(1_600);
    expect(res.qty).toBe(5);
    // Remaining stock is 5 @ ₹120 = 600.
    expect(res.stockValue).toBe(600);

    // One undepleted layer remains (5 @ 120).
    const layers = await caller.valuation.layers({ itemId });
    const active = layers.filter((l: any) => l.qty > 0);
    expect(active).toHaveLength(1);
    expect(active[0].qty).toBe(5);
    expect(Number(active[0].unitCost)).toBe(120);
  });

  // ── WAC ─────────────────────────────────────────────────────────────────────
  it("expenses WAC COGS at the running weighted-average", async () => {
    const itemId = await seedItem("WAC");
    await caller.valuation.intake({ itemId, qty: 10, unitCost: 100 });
    await caller.valuation.intake({ itemId, qty: 10, unitCost: 120 });
    // Average now (1000 + 1200) / 20 = 110.

    const res = await caller.valuation.issue({ itemId, qty: 5 });
    expect(res.cogs).toBe(550); // 5 × 110
    expect(res.avgUnitCost).toBe(110); // unchanged by an issue
    expect(res.qty).toBe(15);
    expect(res.stockValue).toBe(1_650); // 15 × 110
  });

  it("keeps the item book value in step for reporting", async () => {
    const fifo = await seedItem("FIFO");
    const wac = await seedItem("WAC");
    await caller.valuation.intake({ itemId: fifo, qty: 10, unitCost: 100 });
    await caller.valuation.intake({ itemId: wac, qty: 10, unitCost: 200 });

    const report = await caller.valuation.report();
    expect(report.totalStockValue).toBe(1_000 + 2_000);
    const byId = Object.fromEntries(report.items.map((i: any) => [i.id, i]));
    expect(byId[fifo].stockValue).toBe(1_000);
    expect(byId[wac].stockValue).toBe(2_000);
    expect(byId[wac].avgUnitCost).toBe(200);
  });

  it("refuses to issue more than the stock on hand", async () => {
    const itemId = await seedItem("WAC");
    await caller.valuation.intake({ itemId, qty: 5, unitCost: 100 });
    await expect(caller.valuation.issue({ itemId, qty: 8 })).rejects.toThrow(/insufficient/i);
  });

  it("blocks a method change once the item carries stock", async () => {
    const itemId = await seedItem("WAC");
    await caller.valuation.intake({ itemId, qty: 5, unitCost: 100 });
    await expect(
      caller.valuation.setMethod({ itemId, method: "FIFO" }),
    ).rejects.toThrow(/cannot change valuation method/i);
  });

  // ── tenant isolation ─────────────────────────────────────────────────────
  it("does not value an item that belongs to another org", async () => {
    const other = await seedFullOrg();
    const [foreign] = await testDb()
      .insert(inventoryItems)
      .values({ orgId: other.orgId, partNumber: "PN-FOREIGN", name: "Foreign", valuationMethod: "WAC" })
      .returning();
    await expect(
      caller.valuation.intake({ itemId: foreign!.id, qty: 5, unitCost: 100 }),
    ).rejects.toThrow(/not found/i);
  });

  // ── RBAC ─────────────────────────────────────────────────────────────────
  it("denies costed intake to a member without inventory:write", async () => {
    const itemId = await seedItem("WAC");
    const { userId } = await seedUser(orgId, {
      email: `viewer-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "viewer",
      password: "TestPass123!",
    });
    const memberCaller = inventoryRouter.createCaller(
      createMockContext(userId, orgId, {
        user: {
          id: userId,
          orgId,
          email: "viewer@qa.coheronconnect.io",
          name: "Viewer",
          role: "member",
          matrixRole: "viewer",
          status: "active",
        },
      }),
    );
    await expect(
      memberCaller.valuation.intake({ itemId, qty: 5, unitCost: 100 }),
    ).rejects.toThrow();
  });
});
