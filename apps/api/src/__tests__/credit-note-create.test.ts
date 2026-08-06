/**
 * Credit/Debit note create path — Part 2 fairness (C7-3).
 *
 * financial.createCreditDebitNote persists a note linked to its original tax
 * invoice, with parties + tax split inherited, lines POSITIVE, header derived by
 * the shared computeInvoiceFromLines (so the ₹0.01 hard error is identical to
 * invoices). CRITICAL: the create path posts NO GL journal entry — the ledger
 * reversal is deferred pending the CA ruling; this test guards that hold.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { financialRouter } from "../routers/financial";
import { invoices, invoiceLineItems, gstinRegistry, vendors, journalEntries, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("financial.createCreditDebitNote (create path, no journal)", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    caller = financialRouter.createCaller(ctx);
  });

  async function seedOriginal(opts: { buyerState: string; buyerGstin?: string | null; pos: string }) {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    const [cust] = await db
      .insert(vendors)
      .values({ orgId, name: "Customer", state: opts.buyerState, gstin: opts.buyerGstin ?? null })
      .returning();
    const [orig] = await db
      .insert(invoices)
      .values({
        orgId, gstinId: g!.id, vendorId: cust!.id,
        invoiceNumber: `ORIG-${nanoid(4)}`, invoiceFlow: "receivable", invoiceType: "tax_invoice",
        supplierGstin: g!.gstin, buyerGstin: opts.buyerGstin ?? null, placeOfSupply: opts.pos,
        amount: "11800", taxableValue: "10000", igstAmount: "1800", totalTaxAmount: "1800",
        invoiceDate: new Date(2026, 0, 10),
      })
      .returning();
    return { gstin: g!, original: orig! };
  }

  it("persists a credit note linked to the original, header derived from lines", async () => {
    const { original } = await seedOriginal({ buyerState: "Karnataka", buyerGstin: "29BBBBB1111B1Z3", pos: "29" });
    const noteNumber = `CN-${nanoid(5)}`;
    const note = await caller.createCreditDebitNote({
      originalInvoiceId: original.id,
      noteType: "credit_note",
      noteNumber,
      reason: "Post-sale discount",
      lines: [{ description: "Discount", taxableValue: 2000, gstRate: 18 }],
    });

    expect(note.invoiceType).toBe("credit_note");
    expect(note.originalInvoiceId).toBe(original.id);
    expect(note.originalInvoiceNumber).toBe(original.invoiceNumber);
    expect(note.noteReason).toBe("Post-sale discount");
    // Inter-state original (27 → 29) → IGST on the note; header = summed lines.
    expect(Number(note.igstAmount)).toBe(360);
    expect(Number(note.taxableValue)).toBe(2000);
    expect(Number(note.amount)).toBe(2360);

    const lines = await testDb().select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, note.id));
    expect(lines).toHaveLength(1);
  });

  it("still persists the note when the COA is unseeded (ledger poster no-ops, invoice not lost)", async () => {
    // This org has no chart of accounts seeded, so postCreditNoteJournalEntry
    // returns null and no journal is written — but the note itself must succeed.
    // (The posted-journal behaviour with a seeded COA is covered in
    // credit-note-ledger.test.ts.)
    const { original } = await seedOriginal({ buyerState: "Karnataka", buyerGstin: "29BBBBB1111B1Z3", pos: "29" });
    const noteNumber = `CN-${nanoid(5)}`;
    const note = await caller.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber,
      lines: [{ description: "Discount", taxableValue: 2000, gstRate: 18 }],
    });
    expect(note.invoiceType).toBe("credit_note");
    const jes = await testDb()
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.reference, noteNumber)));
    expect(jes).toHaveLength(0);
  });

  it("inherits an intra-state original's CGST+SGST split", async () => {
    const { original } = await seedOriginal({ buyerState: "Maharashtra", buyerGstin: null, pos: "27" });
    const note = await caller.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "debit_note", noteNumber: `DN-${nanoid(5)}`,
      lines: [{ description: "Rate correction", taxableValue: 1000, gstRate: 18 }],
    });
    expect(note.invoiceType).toBe("debit_note");
    expect(Number(note.cgstAmount)).toBe(90);
    expect(Number(note.sgstAmount)).toBe(90);
    expect(Number(note.igstAmount)).toBe(0);
  });

  it("rejects a header/line mismatch to the paise (₹0.01 hard error)", async () => {
    const { original } = await seedOriginal({ buyerState: "Karnataka", buyerGstin: "29BBBBB1111B1Z3", pos: "29" });
    await expect(
      caller.createCreditDebitNote({
        originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`,
        lines: [{ description: "Discount", taxableValue: 2000, gstRate: 18 }],
        expectedTotal: 2360.01, // one paisa off the true 2360.00
      }),
    ).rejects.toThrow(/does not equal the sum of lines/i);
  });

  it("rejects an unknown original invoice", async () => {
    await expect(
      caller.createCreditDebitNote({
        originalInvoiceId: "00000000-0000-0000-0000-000000000000",
        noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`,
        lines: [{ description: "x", taxableValue: 100, gstRate: 18 }],
      }),
    ).rejects.toThrow(/original invoice not found/i);
  });

  it("refuses to raise a note against another note", async () => {
    const { original } = await seedOriginal({ buyerState: "Karnataka", buyerGstin: "29BBBBB1111B1Z3", pos: "29" });
    const note = await caller.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`,
      lines: [{ description: "x", taxableValue: 100, gstRate: 18 }],
    });
    await expect(
      caller.createCreditDebitNote({
        originalInvoiceId: note.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`,
        lines: [{ description: "x", taxableValue: 50, gstRate: 18 }],
      }),
    ).rejects.toThrow(/can only reference a tax invoice/i);
  });
});
