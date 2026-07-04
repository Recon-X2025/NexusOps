/**
 * Inventory costed issue → COGS GL journal-entry auto-posting (Sprint 2 carry-over).
 *
 * The valuation sub-router (Sprint 2.4) computed COGS but never posted it to the
 * ledger. A costed `issue` now posts a balanced entry:
 *
 *   Dr  Cost of Revenue (COGS) (5100) = cogs
 *   Cr  Inventory (asset)      (1170) = cogs
 *
 * `1170 Inventory` was added to the India COA seed. This locks in the wiring:
 * the seed carries 1170, an issue moves 5100↑/1170↓ by the exact COGS, the
 * entry is balanced, and the posting is skipped gracefully when the COA isn't
 * seeded (the issue itself still succeeds and decrements stock).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { inventoryRouter } from "../routers/inventory";
import { accountingRouter } from "../routers/accounting";
import {
  inventoryItems,
  chartOfAccounts,
  journalEntries,
  eq,
  and,
} from "@coheronconnect/db";

const TOL = 0.01;

async function coaBalance(orgId: string, code: string): Promise<number> {
  const db = testDb();
  const [row] = await db
    .select({ currentBalance: chartOfAccounts.currentBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return Number(row?.currentBalance ?? 0);
}

async function coaExists(orgId: string, code: string): Promise<boolean> {
  const db = testDb();
  const [row] = await db
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
  return !!row;
}

describe("Inventory COGS GL posting — issue auto-posts a balanced journal entry", () => {
  let orgId: string;
  let adminId: string;
  let inv: any;
  let acc: any;

  async function seedItem(method: "FIFO" | "WAC"): Promise<string> {
    const [item] = await testDb()
      .insert(inventoryItems)
      .values({ orgId, partNumber: `PN-${nanoid(6)}`, name: "Widget", valuationMethod: method })
      .returning();
    return item!.id;
  }

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    inv = inventoryRouter.createCaller(createMockContext(adminId, orgId));
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await acc.coa.seed();
  });

  it("seeds the 1170 Inventory account via coa.seed()", async () => {
    expect(await coaExists(orgId, "1170")).toBe(true);
  });

  it("issue posts Dr 5100 / Cr 1170 = cogs, balanced", async () => {
    const itemId = await seedItem("WAC");
    await inv.valuation.intake({ itemId, qty: 10, unitCost: 100 }); // avg 100
    const cogsBefore = await coaBalance(orgId, "5100");
    const invBefore = await coaBalance(orgId, "1170");

    const res = await inv.valuation.issue({ itemId, qty: 4 });
    expect(res.cogs).toBe(400); // 4 × 100

    const cogsAfter = await coaBalance(orgId, "5100");
    const invAfter = await coaBalance(orgId, "1170");
    // COGS expense (debit-normal) rises by cogs.
    expect(Math.abs(cogsAfter - cogsBefore - 400)).toBeLessThan(TOL);
    // Inventory asset (credited on issue) falls by cogs.
    expect(Math.abs(invAfter - invBefore - -400)).toBeLessThan(TOL);

    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.type, "manual")));
    expect(jes).toHaveLength(1);
    expect(Number(jes[0]!.totalDebit)).toBe(Number(jes[0]!.totalCredit));
    expect(Number(jes[0]!.totalDebit)).toBe(400);
  });

  it("posts no JE when the COGS/inventory COA is not seeded (issue still succeeds)", async () => {
    // Fresh org WITHOUT coa.seed().
    const bare = await seedFullOrg();
    const bareInv = inventoryRouter.createCaller(createMockContext(bare.adminId!, bare.orgId));
    const [item] = await testDb()
      .insert(inventoryItems)
      .values({ orgId: bare.orgId, partNumber: `PN-${nanoid(6)}`, name: "Widget", valuationMethod: "WAC" })
      .returning();
    await bareInv.valuation.intake({ itemId: item!.id, qty: 10, unitCost: 100 });
    const res = await bareInv.valuation.issue({ itemId: item!.id, qty: 4 });
    // Stock still decremented, COGS still computed.
    expect(res.cogs).toBe(400);
    expect(res.qty).toBe(6);

    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, bare.orgId), eq(journalEntries.type, "manual")));
    expect(jes).toHaveLength(0);
  });
});
