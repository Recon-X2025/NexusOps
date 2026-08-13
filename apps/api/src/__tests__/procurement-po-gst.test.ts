/**
 * PROCUREMENT — Direct PO multi-line + GST, requisition-only approval, and the COA create path.
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 3: the Direct PO now carries N line items each with an HSN/SAC and a GST rate; the server
 * computes CGST/SGST (intra-state) or IGST (inter-state) by place of supply — vendor state vs the
 * org's own GST state — stores the breakdown per line, and rolls taxable/GST/total onto the header.
 * The draft accrual JE stays balanced at the GST-inclusive total.
 *
 * F18: approval belongs on the REQUISITION (status 'pending'), never on a Direct PO already sent to
 * the vendor. This proves the requisition procedure approves a requisition, and that feeding it a PO
 * id (the old widget's bug) is NOT_FOUND — so the fix (list pending requisitions, not draft/sent POs)
 * points the buttons at the object the procedure actually operates on.
 *
 * F2: the accounting `coa.create` the "Add Account" button was missing works, and a procurement
 * posting resolves against REAL chart_of_accounts rows (no placeholder UUIDs).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestEnvironment, seedFullOrg, authedCaller, createSession, cleanupOrg, testDb } from "./helpers";
import {
  vendors,
  gstinRegistry,
  purchaseRequests,
  purchaseOrders,
  poLineItems,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  eq,
  and,
  inArray,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("PROCUREMENT: Direct PO multi-line + GST, requisition-only approval (F18/Step 3/F2)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let orgId: string;

  beforeEach(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    orgId = orgCtx.orgId;
    adminToken = await createSession(orgCtx.adminId);
    // The org's own place of supply: Maharashtra (state code 27).
    await testDb().insert(gstinRegistry).values({
      orgId, gstin: "27ABCDE1234F1Z5", legalName: "Test Org", stateCode: "27", stateName: "Maharashtra", isPrimary: true,
    });
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function seedVendor(state: string) {
    const [v] = await testDb().insert(vendors).values({ orgId, name: `V-${nanoid(4)}`, state }).returning();
    return v!.id;
  }
  const linesOf = (poId: string) => testDb().select().from(poLineItems).where(eq(poLineItems.poId, poId));

  // Step 3 — multi-line stored, intra-state split, header roll-up, balanced accrual.
  it("stores every line, computes intra-state CGST+SGST, rolls up the header, and keeps the accrual balanced", async () => {
    const vendorId = await seedVendor("Maharashtra"); // == org state ⇒ intra-state
    const caller = await authedCaller(adminToken);
    const po = await caller.procurement.purchaseOrders.create({
      vendorId, totalAmount: 0, notes: "Direct PO",
      items: [
        { description: "A", quantity: 2, unitPrice: 1000, hsnSacCode: "1001", gstRate: 18 }, // taxable 2000
        { description: "B", quantity: 1, unitPrice: 5000, gstRate: 12 },                     // taxable 5000
      ],
    });

    const lines = await linesOf(po!.id);
    expect(lines).toHaveLength(2); // multi-line — not collapsed to one row
    const a = lines.find((l) => l.description === "A")!;
    expect(Number(a.taxableValue)).toBe(2000);
    expect(Number(a.cgstAmount)).toBe(180); // 9% of 2000
    expect(Number(a.sgstAmount)).toBe(180);
    expect(Number(a.igstAmount)).toBe(0);
    expect(a.hsnSacCode).toBe("1001");
    const b = lines.find((l) => l.description === "B")!;
    expect(Number(b.cgstAmount)).toBe(300); // 6% of 5000
    expect(Number(b.sgstAmount)).toBe(300);

    // Header roll-up: taxable 7000, GST 960 (180+180+300+300), total 7960.
    const [poRow] = await testDb().select().from(purchaseOrders).where(eq(purchaseOrders.id, po!.id));
    expect(Number(poRow!.taxableValue)).toBe(7000);
    expect(Number(poRow!.gstAmount)).toBe(960);
    expect(Number(poRow!.totalAmount)).toBe(7960);

    // Draft accrual JE is balanced at the GST-inclusive total.
    const [je] = await testDb().select().from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.number, `JE-PO-${po!.poNumber}`)));
    expect(Number(je!.totalDebit)).toBe(7960);
    expect(Number(je!.totalDebit)).toBe(Number(je!.totalCredit));
  });

  // Step 3 — inter-state place of supply yields IGST, not CGST/SGST.
  it("computes inter-state IGST when the vendor is in another state", async () => {
    const vendorId = await seedVendor("Karnataka"); // != Maharashtra ⇒ inter-state
    const caller = await authedCaller(adminToken);
    const po = await caller.procurement.purchaseOrders.create({
      vendorId, totalAmount: 0, items: [{ description: "A", quantity: 1, unitPrice: 10000, gstRate: 18 }],
    });
    const [a] = await linesOf(po!.id);
    expect(Number(a!.igstAmount)).toBe(1800); // 18% of 10000
    expect(Number(a!.cgstAmount)).toBe(0);
    expect(Number(a!.sgstAmount)).toBe(0);
  });

  // Step 3 — a PO line with no GST rate takes 0 (no phantom tax for callers that don't model GST).
  it("applies no GST when a line omits the rate (accrual total = taxable value)", async () => {
    const vendorId = await seedVendor("Maharashtra");
    const caller = await authedCaller(adminToken);
    const po = await caller.procurement.purchaseOrders.create({
      vendorId, totalAmount: 0, items: [{ description: "A", quantity: 2, unitPrice: 500 }],
    });
    const [poRow] = await testDb().select().from(purchaseOrders).where(eq(purchaseOrders.id, po!.id));
    expect(Number(poRow!.gstAmount)).toBe(0);
    expect(Number(poRow!.totalAmount)).toBe(1000);
  });

  // F18 — the requisition procedure approves a requisition; a PO id is NOT_FOUND through it.
  it("approves a pending requisition, but 404s when given a PO id (approval is requisition-only)", async () => {
    const [pr] = await testDb().insert(purchaseRequests).values({
      orgId, number: `PR-${nanoid(5)}`, requesterId: orgCtx.adminId, title: "Laptops", status: "pending", totalAmount: "1000",
    }).returning();
    const caller = await authedCaller(adminToken);

    await caller.procurement.purchaseRequests.approve({ id: pr!.id });
    const [after] = await testDb().select().from(purchaseRequests).where(eq(purchaseRequests.id, pr!.id));
    expect(after!.status).toBe("approved");

    // A PO id is not in purchase_requests — the old widget passed exactly this and got the 404.
    const vendorId = await seedVendor("Maharashtra");
    const po = await caller.procurement.purchaseOrders.create({
      vendorId, totalAmount: 0, items: [{ description: "A", quantity: 1, unitPrice: 100 }],
    });
    await expect(caller.procurement.purchaseRequests.approve({ id: po!.id })).rejects.toThrow(/not_?found/i);
  });

  // F2 — the COA create the button was missing works, and a procurement posting resolves against real COA rows.
  it("creates a COA account and posts a PO accrual against real chart_of_accounts rows", async () => {
    const caller = await authedCaller(adminToken);
    const acct = await caller.accounting.coa.create({
      code: `SEED-${nanoid(4)}`, name: "Consumables Expense", type: "expense", openingBalance: 0,
    });
    expect(acct).toBeTruthy();
    const listed = await caller.accounting.coa.list({ limit: 200 });
    expect(listed.some((a) => a.id === (acct as { id: string }).id)).toBe(true);

    // A procurement posting resolves against the org's real chart — the JE lines reference existing COA rows.
    const vendorId = await seedVendor("Maharashtra");
    const po = await caller.procurement.purchaseOrders.create({
      vendorId, totalAmount: 0, items: [{ description: "A", quantity: 1, unitPrice: 1000, gstRate: 18 }],
    });
    const [je] = await testDb().select().from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.number, `JE-PO-${po!.poNumber}`)));
    const jl = await testDb().select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, je!.id));
    const accts = await testDb().select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), inArray(chartOfAccounts.id, jl.map((l) => l.accountId))));
    expect(accts.length).toBe(2); // both JE legs resolve to real accounts
  });
});
