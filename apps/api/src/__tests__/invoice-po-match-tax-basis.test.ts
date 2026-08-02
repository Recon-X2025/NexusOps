/**
 * A10 — Three-way match must compare like tax basis for like.
 * ──────────────────────────────────────────────────────────
 * The receiving control (`computeInvoicePoMatch`, `lib/invoice-po-match.ts`)
 * compared a tax-INCLUSIVE invoice total (`invoice.amount` = taxable + GST)
 * against tax-EXCLUSIVE references:
 *   - the two-way header compare against `po.totalAmount`, and
 *   - the three-way compare against the GRN received value, which is rebuilt
 *     from `poLine.unitPrice × acceptedQty` (a per-unit taxable price, no GST).
 * So a genuinely correct GST-bearing invoice looked ~18% larger than what it
 * was matched against and failed the match on a phantom "discrepancy" that was
 * really just the tax. The fix compares taxable value to taxable value on both
 * sides (`invoice.taxableValue` vs `po.taxableValue`, and vs the exclusive GRN
 * received value).
 *
 * ─ Both match paths are covered here ─
 * Nothing currently populates `invoices.grnId` and no goods receipt can yet be
 * created (that lands with the Phase 3 goods-receipt build), so the three-way
 * branch is otherwise unreachable. This test is the only thing exercising it
 * until then, so it must hold BOTH paths right:
 *   - TWO-WAY  (PO only, no GRN): header taxable-vs-taxable.
 *   - THREE-WAY (PO + GRN): header + GRN-received taxable-vs-taxable.
 *
 * ─ Fairness ─
 * This is a FAIR probe. Each "correct" case is a genuinely correct invoice: its
 * taxable value equals the PO's (and the GRN's), with GST layered on top. Under
 * the old inclusive-vs-exclusive compare it fails on the phantom tax gap (RED);
 * under the taxable-vs-taxable fix it passes (GREEN). The mismatch case is a
 * genuinely over-billed invoice (taxable value exceeds the PO beyond tolerance)
 * and must STILL fail after the fix — so the fix is not "make everything pass".
 * The org's default absolute match tolerance is ₹1, far below the 18% tax on
 * these amounts, so the phantom gap is unambiguous.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { computeInvoicePoMatch } from "../lib/invoice-po-match";
import {
  vendors,
  purchaseOrders,
  poLineItems,
  goodsReceiptNotes,
  grnLineItems,
  invoices,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("A10: three-way match compares like tax basis for like", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
    // Invoices/POs/vendors are org-CASCADE, dropped when the org row is deleted.
  });

  async function seedVendor(): Promise<string> {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Vendor ${nanoid(4)}`, state: "Maharashtra" })
      .returning();
    return v!.id;
  }

  it("TWO-WAY (PO only): a correct 18% invoice matches its PO on taxable value", async () => {
    const vendorId = await seedVendor();

    // Taxable 1,00,000 + 18% GST = gross 1,18,000. The PO carries the same
    // taxable value; its stored total here is the tax-exclusive taxable value.
    const [po] = await testDb()
      .insert(purchaseOrders)
      .values({
        orgId,
        poNumber: `PO-${nanoid(6)}`,
        vendorId,
        taxableValue: "100000",
        totalAmount: "100000",
      })
      .returning();

    const [inv] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        taxableValue: "100000",
        totalTaxAmount: "18000",
        amount: "118000",
      })
      .returning();

    const res = await computeInvoicePoMatch(testDb(), orgId, inv!.id, po!.id);

    // Old code compared amount (1,18,000, inclusive) vs po.totalAmount and failed
    // by 18,000 ≫ ₹1 tolerance. Taxable-vs-taxable is 0.
    expect(res.matched).toBe(true);
    expect(res.discrepancy).toBeLessThanOrEqual(res.toleranceUsed);
  });

  it("THREE-WAY (PO + GRN): a correct 18% invoice matches PO and GRN on taxable value", async () => {
    const vendorId = await seedVendor();

    const [po] = await testDb()
      .insert(purchaseOrders)
      .values({
        orgId,
        poNumber: `PO-${nanoid(6)}`,
        vendorId,
        taxableValue: "100000",
        totalAmount: "118000",
      })
      .returning();

    // One PO line: 100 units @ ₹1,000 = 1,00,000 taxable.
    const [poLine] = await testDb()
      .insert(poLineItems)
      .values({
        poId: po!.id,
        description: "Widgets",
        quantity: 100,
        unitPrice: "1000",
        taxableValue: "100000",
        acceptedQuantity: 100,
      })
      .returning();

    // A goods receipt accepting all 100 units → received value 1,00,000 (tax-exclusive).
    const [grn] = await testDb()
      .insert(goodsReceiptNotes)
      .values({ orgId, grnNumber: `GRN-${nanoid(6)}`, poId: po!.id })
      .returning();
    await testDb().insert(grnLineItems).values({
      grnId: grn!.id,
      poLineItemId: poLine!.id,
      orderedQuantity: 100,
      receivedQuantity: 100,
      acceptedQuantity: 100,
    });

    const [inv] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        poId: po!.id,
        grnId: grn!.id,
        taxableValue: "100000",
        totalTaxAmount: "18000",
        amount: "118000",
      })
      .returning();

    const res = await computeInvoicePoMatch(testDb(), orgId, inv!.id, po!.id);

    // Old three-way compared amount (1,18,000) vs GRN received (1,00,000) →
    // gap 18,000 ≫ ₹1. Taxable-vs-received is 0.
    expect(res.grnReceivedValue).toBe(100000);
    expect(res.matched).toBe(true);
  });

  it("still FAILS a genuinely over-billed invoice (taxable exceeds PO beyond tolerance)", async () => {
    const vendorId = await seedVendor();

    const [po] = await testDb()
      .insert(purchaseOrders)
      .values({
        orgId,
        poNumber: `PO-${nanoid(6)}`,
        vendorId,
        taxableValue: "100000",
        totalAmount: "100000",
      })
      .returning();

    // Invoice taxable 1,20,000 — 20,000 over the PO's 1,00,000, far past ₹1.
    const [inv] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        taxableValue: "120000",
        totalTaxAmount: "21600",
        amount: "141600",
      })
      .returning();

    const res = await computeInvoicePoMatch(testDb(), orgId, inv!.id, po!.id);

    expect(res.matched).toBe(false);
    expect(res.discrepancy).toBeGreaterThan(res.toleranceUsed);
  });
});
