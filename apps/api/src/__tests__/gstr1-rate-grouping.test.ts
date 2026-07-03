/**
 * GSTR-1 rate-grouping invariant tests (Sprint 0.1).
 *
 * Regression guard for the previously hardcoded `rt: 18` in accounting.ts.
 * GSTR-1 `itms` must reflect the ACTUAL GST rates on an invoice's line items,
 * grouped by rate — and fall back to a header-derived rate when an invoice has
 * no line items (never a hardcoded 18).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { gstinRegistry, invoices, invoiceLineItems, vendors } from "@coheronconnect/db";

describe("GSTR-1 rate grouping (Sprint 0.1)", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;
  let vendorId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    caller = accountingRouter.createCaller(ctx);
    const db = testDb();
    const [v] = await db
      .insert(vendors)
      .values({ orgId, name: "GSTR-1 Test Vendor" })
      .returning();
    vendorId = v!.id;
  });

  async function seedGstin() {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({
        orgId,
        gstin: "27AAAAA0000A1Z5",
        legalName: "Test Co",
        stateCode: "27",
        stateName: "Maharashtra",
        isPrimary: true,
      })
      .returning();
    return g!;
  }

  it("groups line items by distinct GST rate into separate itm_det entries", async () => {
    const db = testDb();
    const g = await seedGstin();
    // Intra-state invoice with two different rates: 18% and 5%.
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        invoiceNumber: "INV-MULTI-1",
        vendorId,
        invoiceFlow: "receivable",
        buyerGstin: "27BBBBB1111B1Z3",
        placeOfSupply: "27",
        taxableValue: "3000",
        cgstAmount: "295",
        sgstAmount: "295",
        igstAmount: "0",
        totalTaxAmount: "590",
        amount: "3590",
        invoiceDate: new Date(2026, 0, 15),
      })
      .returning();

    await db.insert(invoiceLineItems).values([
      {
        invoiceId: inv!.id,
        lineItemNumber: 1,
        description: "Item @18%",
        taxableValue: "2000",
        gstRate: "18",
        cgstAmount: "180",
        sgstAmount: "180",
        igstAmount: "0",
        lineTotal: "2360",
      },
      {
        invoiceId: inv!.id,
        lineItemNumber: 2,
        description: "Item @5%",
        taxableValue: "1000",
        gstRate: "5",
        cgstAmount: "25",
        sgstAmount: "25",
        igstAmount: "0",
        lineTotal: "1050",
      },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    const b2bInv = res.payload.b2b.find((x: any) => x.ctin === "27BBBBB1111B1Z3");
    expect(b2bInv).toBeDefined();
    const itms = b2bInv.inv[0].itms;
    // Two distinct rates → two itm_det entries, sorted ascending by rate.
    expect(itms).toHaveLength(2);
    expect(itms.map((i: any) => i.itm_det.rt)).toEqual([5, 18]);
    // No hardcoded 18 leaking into the 5% line.
    const r5 = itms.find((i: any) => i.itm_det.rt === 5).itm_det;
    expect(r5.txval).toBe(1000);
    expect(r5.camt).toBe(25);
    expect(r5.samt).toBe(25);
    const r18 = itms.find((i: any) => i.itm_det.rt === 18).itm_det;
    expect(r18.txval).toBe(2000);
    expect(r18.camt).toBe(180);
  });

  it("collapses multiple line items at the same rate into one itm_det", async () => {
    const db = testDb();
    const g = await seedGstin();
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        invoiceNumber: "INV-SAME-1",
        vendorId,
        invoiceFlow: "receivable",
        buyerGstin: "27CCCCC2222C1Z1",
        placeOfSupply: "27",
        taxableValue: "2000",
        cgstAmount: "180",
        sgstAmount: "180",
        igstAmount: "0",
        totalTaxAmount: "360",
        amount: "2360",
        invoiceDate: new Date(2026, 0, 20),
      })
      .returning();
    await db.insert(invoiceLineItems).values([
      { invoiceId: inv!.id, lineItemNumber: 1, description: "A", taxableValue: "1200", gstRate: "18", cgstAmount: "108", sgstAmount: "108", igstAmount: "0", lineTotal: "1416" },
      { invoiceId: inv!.id, lineItemNumber: 2, description: "B", taxableValue: "800", gstRate: "18", cgstAmount: "72", sgstAmount: "72", igstAmount: "0", lineTotal: "944" },
    ]);

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    const b2bInv = res.payload.b2b.find((x: any) => x.ctin === "27CCCCC2222C1Z1");
    const itms = b2bInv.inv[0].itms;
    expect(itms).toHaveLength(1);
    expect(itms[0].itm_det.rt).toBe(18);
    expect(itms[0].itm_det.txval).toBe(2000);
    expect(itms[0].itm_det.camt).toBe(180);
    expect(itms[0].itm_det.samt).toBe(180);
  });

  it("derives the rate from header amounts when an invoice has no line items (no hardcoded 18)", async () => {
    const db = testDb();
    const g = await seedGstin();
    // Inter-state invoice at 12% IGST, no line items → fallback path.
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        invoiceNumber: "INV-FALLBACK-1",
        vendorId,
        invoiceFlow: "receivable",
        buyerGstin: "29DDDDD3333D1Z9",
        placeOfSupply: "29",
        isInterstate: true,
        taxableValue: "1000",
        cgstAmount: "0",
        sgstAmount: "0",
        igstAmount: "120",
        totalTaxAmount: "120",
        amount: "1120",
        invoiceDate: new Date(2026, 0, 25),
      })
      .returning();

    const res = await caller.gstr.generateGSTR1({ gstinId: g.id, month: 1, year: 2026 });
    const b2bInv = res.payload.b2b.find((x: any) => x.ctin === "29DDDDD3333D1Z9");
    const itms = b2bInv.inv[0].itms;
    expect(itms).toHaveLength(1);
    // 120 / 1000 = 12%, NOT the old hardcoded 18.
    expect(itms[0].itm_det.rt).toBe(12);
    expect(itms[0].itm_det.iamt).toBe(120);
    expect(itms[0].itm_det.txval).toBe(1000);
  });
});
