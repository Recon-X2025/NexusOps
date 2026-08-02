/**
 * A9 — Goods-receipt (GRN) create path.
 * ─────────────────────────────────────
 * The `goods_receipt_notes` / `grn_line_items` tables and the three-way match
 * that reads them (lib/invoice-po-match.ts) already existed, but nothing created
 * a GRN — so `invoices.grnId` was always null in production and the advertised
 * three-way match silently degraded to a two-way (invoice ≈ PO) match. A9 adds
 * `procurement.goodsReceipts.create`: the real "receive goods against a PO"
 * document, so an invoice can reference an actual GRN and the match becomes
 * genuinely three-way (invoice ≈ PO ≈ GRN).
 *
 * ─ What these tests carry ─
 * The POSITIVE test proves the loop closes: receive against a PO through the
 * mutation, link an invoice to the resulting GRN, and assert the match is now a
 * real three-way match with grnReceivedValue populated.
 *
 * The NEGATIVE tests carry equal weight — this is new write surface, and the
 * only thing standing between it and a cross-tenant hole is the ownership pair:
 *   (1) the referenced PO must belong to the caller's org, and
 *   (2) every submitted poLineItemId must belong to THAT PO.
 * They assert a foreign PO is rejected and a spliced-in foreign PO line is
 * rejected — and, critically, that NOTHING is written when either check fails.
 *
 * The over-receipt test pins the pilot rule (no over-receipt; CONFIRM WITH
 * CUSTOMER), and the partial-receipt test pins the cross-GRN quantity rollup.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { procurementRouter } from "../routers/procurement";
import { computeInvoicePoMatch } from "../lib/invoice-po-match";
import {
  vendors,
  purchaseOrders,
  poLineItems,
  goodsReceiptNotes,
  grnLineItems,
  invoices,
  eq,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("A9: goods-receipt create path", () => {
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = procurementRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  async function seedVendor(targetOrg: string = orgId): Promise<string> {
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId: targetOrg, name: `Vendor ${nanoid(4)}`, state: "Maharashtra" })
      .returning();
    return v!.id;
  }

  /** Seed a PO with a single line (100 units @ ₹1,000 = ₹1,00,000 taxable) in `targetOrg`. */
  async function seedPoWithLine(targetOrg: string = orgId): Promise<{ poId: string; poLineId: string; vendorId: string }> {
    const vendorId = await seedVendor(targetOrg);
    const [po] = await testDb()
      .insert(purchaseOrders)
      .values({
        orgId: targetOrg,
        poNumber: `PO-${nanoid(6)}`,
        vendorId,
        taxableValue: "100000",
        totalAmount: "118000",
      })
      .returning();
    const [poLine] = await testDb()
      .insert(poLineItems)
      .values({
        poId: po!.id,
        description: "Widgets",
        quantity: 100,
        unitPrice: "1000",
        taxableValue: "100000",
      })
      .returning();
    return { poId: po!.id, poLineId: poLine!.id, vendorId };
  }

  it("receives goods against a PO, then the match is a real three-way match (invoice ≈ PO ≈ GRN)", async () => {
    const { poId, poLineId, vendorId } = await seedPoWithLine();

    const grn = await caller.goodsReceipts.create({
      poId,
      lines: [{ poLineItemId: poLineId, receivedQuantity: 100, acceptedQuantity: 100 }],
    });
    expect(grn.status).toBe("accepted");

    // The GRN and its line were actually written, with the ordered qty captured.
    const full = await caller.goodsReceipts.get({ id: grn.id });
    expect(full.lines).toHaveLength(1);
    expect(full.lines[0].orderedQuantity).toBe(100);
    expect(full.lines[0].acceptedQuantity).toBe(100);

    // PO line rolled up + PO status advanced to fully received.
    const [poLineAfter] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, poLineId));
    expect(poLineAfter!.receivedQuantity).toBe(100);
    expect(poLineAfter!.acceptedQuantity).toBe(100);
    const [poAfter] = await testDb().select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
    expect(poAfter!.status).toBe("received");

    // Link an invoice to the GRN and confirm the three-way branch now fires with
    // a real received value (100 × ₹1,000, tax-exclusive), matching the invoice.
    const [inv] = await testDb()
      .insert(invoices)
      .values({
        orgId,
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        poId,
        grnId: grn.id,
        taxableValue: "100000",
        totalTaxAmount: "18000",
        amount: "118000",
      })
      .returning();

    const res = await computeInvoicePoMatch(testDb(), orgId, inv!.id, poId);
    expect(res.grnReceivedValue).toBe(100000);
    expect(res.matched).toBe(true);
  });

  it("REJECTS receiving against another org's PO — and writes nothing", async () => {
    // A PO owned by a different tenant.
    const other = await seedPoWithLine((await seedFullOrg()).orgId);

    await expect(
      caller.goodsReceipts.create({
        poId: other.poId,
        lines: [{ poLineItemId: other.poLineId, receivedQuantity: 100, acceptedQuantity: 100 }],
      }),
    ).rejects.toThrow(/not found/i);

    // No GRN was created for anyone, and the foreign PO line is untouched.
    const grns = await testDb().select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, other.poId));
    expect(grns).toHaveLength(0);
    const [foreignLine] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, other.poLineId));
    expect(foreignLine!.receivedQuantity).toBe(0);
  });

  it("REJECTS a spliced-in foreign PO line — and writes nothing", async () => {
    // Our own PO, plus a line that belongs to a DIFFERENT PO in the SAME org.
    const mine = await seedPoWithLine();
    const otherOfMine = await seedPoWithLine();

    await expect(
      caller.goodsReceipts.create({
        poId: mine.poId,
        lines: [
          { poLineItemId: mine.poLineId, receivedQuantity: 50, acceptedQuantity: 50 },
          // This line is not a member of mine.poId — must be rejected.
          { poLineItemId: otherOfMine.poLineId, receivedQuantity: 50, acceptedQuantity: 50 },
        ],
      }),
    ).rejects.toThrow(/does not belong to this purchase order/i);

    // The whole create rolled back: no GRN, and NEITHER PO line moved (not even
    // the legitimate one, since the transaction aborts atomically).
    const grns = await testDb().select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, mine.poId));
    expect(grns).toHaveLength(0);
    const [mineLine] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, mine.poLineId));
    expect(mineLine!.receivedQuantity).toBe(0);
    const [otherLine] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, otherOfMine.poLineId));
    expect(otherLine!.receivedQuantity).toBe(0);
  });

  it("REJECTS over-receipt (received beyond the PO line's outstanding quantity)", async () => {
    const { poId, poLineId } = await seedPoWithLine();

    await expect(
      caller.goodsReceipts.create({
        poId,
        lines: [{ poLineItemId: poLineId, receivedQuantity: 101, acceptedQuantity: 101 }],
      }),
    ).rejects.toThrow(/over-receipt not allowed/i);

    const grns = await testDb().select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, poId));
    expect(grns).toHaveLength(0);
  });

  it("REJECTS accepted + rejected exceeding received, and requires a reason for rejections", async () => {
    const { poId, poLineId } = await seedPoWithLine();

    // accepted (60) + rejected (50) = 110 > received (100).
    await expect(
      caller.goodsReceipts.create({
        poId,
        lines: [
          { poLineItemId: poLineId, receivedQuantity: 100, acceptedQuantity: 60, rejectedQuantity: 50, rejectionReason: "damaged" },
        ],
      }),
    ).rejects.toThrow(/cannot exceed received/i);

    // A rejection with no reason.
    await expect(
      caller.goodsReceipts.create({
        poId,
        lines: [{ poLineItemId: poLineId, receivedQuantity: 100, acceptedQuantity: 90, rejectedQuantity: 10 }],
      }),
    ).rejects.toThrow(/rejection reason is required/i);
  });

  it("handles a partial receipt then a second receipt, rolling quantities up across GRNs", async () => {
    const { poId, poLineId } = await seedPoWithLine();

    const first = await caller.goodsReceipts.create({
      poId,
      lines: [{ poLineItemId: poLineId, receivedQuantity: 60, acceptedQuantity: 60 }],
    });
    expect(first.status).toBe("partial_acceptance"); // short of the 100 ordered
    const [poAfter1] = await testDb().select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
    expect(poAfter1!.status).toBe("partially_received");
    const [line1] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, poLineId));
    expect(line1!.receivedQuantity).toBe(60);

    // Second receipt for the remaining 40 — the outstanding is now 40, so this is
    // within bounds and completes the line.
    const second = await caller.goodsReceipts.create({
      poId,
      lines: [{ poLineItemId: poLineId, receivedQuantity: 40, acceptedQuantity: 40 }],
    });
    expect(second.status).toBe("accepted");
    const [line2] = await testDb().select().from(poLineItems).where(eq(poLineItems.id, poLineId));
    expect(line2!.receivedQuantity).toBe(100);
    expect(line2!.acceptedQuantity).toBe(100);
    const [poAfter2] = await testDb().select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
    expect(poAfter2!.status).toBe("received");

    // Two GRNs exist for this PO.
    const grns = await testDb().select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, poId));
    expect(grns).toHaveLength(2);
    // A third receipt would now over-receive (outstanding is 0).
    await expect(
      caller.goodsReceipts.create({
        poId,
        lines: [{ poLineItemId: poLineId, receivedQuantity: 1, acceptedQuantity: 1 }],
      }),
    ).rejects.toThrow(/over-receipt not allowed/i);
  });
});
