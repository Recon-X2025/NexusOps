/**
 * The third leg of the three-way match was unreachable through the product.
 *
 * `computeInvoicePoMatch` gates the entire GRN comparison on `invoice.grnId`
 * (lib/invoice-po-match.ts) and `routers/procurement.ts` documents the intent:
 * "an invoice can reference a real GRN (`invoices.grnId`) and the match reads
 * accepted-qty × PO unit price". The column exists and goods receipts CAN now be
 * created — but nothing ever wrote `invoices.grnId`, so every invoice the product
 * created matched against the PO alone.
 *
 * Demonstrated live on 5434 before this fix (PO-0043 / GRN-0003): 10 units
 * ordered, 10 received, 8 accepted, 2 rejected as damaged. The invoice for the 8
 * ACCEPTED units was REFUSED (discrepancy 10,000 against a ₹1 tolerance) with
 * `grnReceivedValue = null`, while only an invoice for the full 10 units
 * reconciled — i.e. the control pointed at paying for goods that were rejected.
 *
 * These tests drive the real `financial.createInvoice` mutation, because the gap
 * was in the WRITE PATH, not in the matching engine. The engine was already
 * correct and already covered by invoice-po-match-tax-basis.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedFullOrg, makeContext, testDb, cleanupOrg } from "./helpers";
import { appRouter } from "../routers";
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

type Caller = ReturnType<typeof appRouter.createCaller>;

describe("An invoice can reference the goods receipt it is billing for", () => {
  let orgId: string;
  let adminId: string;
  let caller: Caller;

  const UNIT = 5000;
  const ORDERED = 10;
  const ACCEPTED = 8; // 2 rejected as damaged

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    caller = appRouter.createCaller(makeContext(adminId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /** A PO for 10 units, of which only 8 were accepted on receipt. */
  async function seedPoWithPartialReceipt(
    opts: { targetOrgId?: string; accepted?: number } = {},
  ) {
    const targetOrgId = opts.targetOrgId ?? orgId;
    const accepted = opts.accepted ?? ACCEPTED;
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId: targetOrgId, name: `Vendor ${nanoid(4)}`, state: "Maharashtra" })
      .returning();

    const [po] = await testDb()
      .insert(purchaseOrders)
      .values({
        orgId: targetOrgId,
        poNumber: `PO-${nanoid(6)}`,
        vendorId: v!.id,
        taxableValue: String(ORDERED * UNIT),
        totalAmount: String(ORDERED * UNIT),
      })
      .returning();

    const [poLine] = await testDb()
      .insert(poLineItems)
      .values({
        poId: po!.id,
        description: "Relay units",
        quantity: ORDERED,
        unitPrice: String(UNIT),
        taxableValue: String(ORDERED * UNIT),
        receivedQuantity: ORDERED,
        acceptedQuantity: accepted,
      })
      .returning();

    const [grn] = await testDb()
      .insert(goodsReceiptNotes)
      .values({
        orgId: targetOrgId,
        poId: po!.id,
        grnNumber: `GRN-${nanoid(6)}`,
        status: accepted === ORDERED ? "accepted" : "partial_acceptance",
      })
      .returning();

    await testDb().insert(grnLineItems).values({
      grnId: grn!.id,
      poLineItemId: poLine!.id,
      orderedQuantity: ORDERED,
      receivedQuantity: ORDERED,
      acceptedQuantity: accepted,
      rejectedQuantity: ORDERED - accepted,
      rejectionReason: "damaged in transit",
    });

    return { vendorId: v!.id, poId: po!.id, grnId: grn!.id };
  }

  it("stores grnId when an invoice is raised against a receipt", async () => {
    const { vendorId, grnId } = await seedPoWithPartialReceipt();

    const created = await caller.financial.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: String(ACCEPTED * UNIT),
      gstRate: 18,
      grnId,
    } as never);

    const [row] = await testDb().select().from(invoices).where(eq(invoices.id, created.id));
    expect(row!.grnId).toBe(grnId);
  });

  it("brings the GRN leg into the comparison at accepted-qty x PO unit price", async () => {
    const { vendorId, poId, grnId } = await seedPoWithPartialReceipt();

    const created = await caller.financial.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: String(ACCEPTED * UNIT),
      gstRate: 18,
      grnId,
    } as never);

    const res = await computeInvoicePoMatch(testDb(), orgId, created.id, poId);

    // Was null for every product-created invoice: 8 accepted x 5,000 = 40,000.
    expect(res.grnReceivedValue).toBe(ACCEPTED * UNIT);
  });

  it("matches when the receipt is FULL and the invoice equals PO and GRN alike", async () => {
    // The documented invariant is invoice ~= PO ~= GRN. A fully received PO is
    // where all three genuinely agree, so this is the true green path.
    const { vendorId, poId, grnId } = await seedPoWithPartialReceipt({ accepted: ORDERED });

    const created = await caller.financial.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: String(ORDERED * UNIT),
      gstRate: 18,
      grnId,
    } as never);

    const res = await computeInvoicePoMatch(testDb(), orgId, created.id, poId);
    expect(res.grnReceivedValue).toBe(ORDERED * UNIT);
    expect(res.matched).toBe(true);
  });

  it("still refuses an invoice billed for goods that were REJECTED", async () => {
    const { vendorId, poId, grnId } = await seedPoWithPartialReceipt();

    const created = await caller.financial.createInvoice({
      vendorId,
      invoiceNumber: `AP-${nanoid(6)}`,
      amount: String(ORDERED * UNIT), // 50,000 — billing for all 10
      gstRate: 18,
      grnId,
    } as never);

    const res = await computeInvoicePoMatch(testDb(), orgId, created.id, poId);
    expect(res.matched).toBe(false);
  });

  it("refuses a goods receipt belonging to another tenant", async () => {
    const { vendorId } = await seedPoWithPartialReceipt();
    const other = await seedFullOrg();
    const foreign = await seedPoWithPartialReceipt({ targetOrgId: other.orgId });

    await expect(
      caller.financial.createInvoice({
        vendorId,
        invoiceNumber: `AP-${nanoid(6)}`,
        amount: String(ACCEPTED * UNIT),
        gstRate: 18,
        grnId: foreign.grnId,
      } as never),
    ).rejects.toThrow(/goods receipt/i);

    await cleanupOrg(other.orgId);
  });
});
