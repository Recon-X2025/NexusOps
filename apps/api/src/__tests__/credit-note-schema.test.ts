/**
 * Credit/Debit note schema completion — Part 1 fairness (C7-3).
 *
 * Before this: the invoiceType enum had credit_note/debit_note but the only link
 * to the original invoice was a bare originalInvoiceNumber text — no date, no FK.
 * A compliant Table 9 (CDNR) entry needs the original invoice's DATE and a real
 * reference. This proves the new columns (originalInvoiceId FK, originalInvoiceDate,
 * noteReason) exist, persist, and that the self-FK is enforced with SET NULL.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, testDb, cleanupOrg } from "./helpers";
import { invoices, gstinRegistry, vendors, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("credit/debit note schema linkage", () => {
  let orgId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedVendorGstin() {
    const db = testDb();
    const [v] = await db.insert(vendors).values({ orgId, name: "CN Vendor" }).returning();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    return { vendorId: v!.id, gstinId: g!.id };
  }

  it("persists a credit note linked to its original invoice (id + date + reason)", async () => {
    const db = testDb();
    const { vendorId, gstinId } = await seedVendorGstin();
    const origDate = new Date(2026, 0, 10);
    const [orig] = await db
      .insert(invoices)
      .values({
        orgId, gstinId, vendorId, invoiceNumber: `ORIG-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "tax_invoice",
        amount: "11800", taxableValue: "10000", igstAmount: "1800", totalTaxAmount: "1800",
        invoiceDate: origDate,
      })
      .returning();

    const [note] = await db
      .insert(invoices)
      .values({
        orgId, gstinId, vendorId, invoiceNumber: `CN-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "credit_note",
        originalInvoiceId: orig!.id,
        originalInvoiceNumber: orig!.invoiceNumber,
        originalInvoiceDate: origDate,
        noteReason: "Post-sale discount",
        amount: "2360", taxableValue: "2000", igstAmount: "360", totalTaxAmount: "360",
        invoiceDate: new Date(2026, 0, 20),
      })
      .returning();

    expect(note!.invoiceType).toBe("credit_note");
    expect(note!.originalInvoiceId).toBe(orig!.id);
    expect(note!.originalInvoiceDate).toEqual(origDate);
    expect(note!.noteReason).toBe("Post-sale discount");
  });

  it("SET NULL on the self-FK: deleting the original nulls the note's link but keeps the note", async () => {
    const db = testDb();
    const { vendorId, gstinId } = await seedVendorGstin();
    const [orig] = await db
      .insert(invoices)
      .values({
        orgId, gstinId, vendorId, invoiceNumber: `ORIG2-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "tax_invoice", amount: "1000", invoiceDate: new Date(2026, 0, 10),
      })
      .returning();
    const [note] = await db
      .insert(invoices)
      .values({
        orgId, gstinId, vendorId, invoiceNumber: `CN2-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "credit_note",
        originalInvoiceId: orig!.id, originalInvoiceNumber: orig!.invoiceNumber,
        amount: "500", invoiceDate: new Date(2026, 0, 20),
      })
      .returning();

    await db.delete(invoices).where(eq(invoices.id, orig!.id));
    const [after] = await db.select().from(invoices).where(eq(invoices.id, note!.id));
    expect(after).toBeDefined();
    expect(after!.originalInvoiceId).toBeNull();
    // The durable text record survives for the filing trail.
    expect(after!.originalInvoiceNumber).toBe(orig!.invoiceNumber);
  });
});
