/**
 * Credit-note ledger posting + s.34 validations — Part 5 fairness (C7-3, CA-ruled).
 *
 * With the COA seeded, a GST credit note posts the CA-ruled reversal:
 *   Dr Sales Returns (4130, contra-revenue)   Dr Output GST Payable   Cr AR (1130)
 * dated to the note's own issuance period. Plus the three validations that did not
 * exist: time limit (→ financial note, out of Table 9), value cap, rate in force.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { financialRouter } from "../routers/financial";
import {
  invoices, invoiceLineItems, gstinRegistry, vendors,
  journalEntries, journalEntryLines, chartOfAccounts, eq, and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("credit-note ledger posting + validations (Part 5)", () => {
  let ctx: any;
  let acct: any;
  let fin: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    acct = accountingRouter.createCaller(ctx);
    fin = financialRouter.createCaller(ctx);
    await acct.coa.seed(); // seeds the India COA incl. 4130 Sales Returns
  });

  async function seedOriginal(opts: { buyerGstin: string | null; buyerState: string; pos: string; interstate: boolean }) {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    const [cust] = await db
      .insert(vendors)
      .values({ orgId, name: "Customer", state: opts.buyerState, gstin: opts.buyerGstin })
      .returning();
    const tax = opts.interstate
      ? { igstAmount: "1800", cgstAmount: "0", sgstAmount: "0" }
      : { igstAmount: "0", cgstAmount: "900", sgstAmount: "900" };
    const [orig] = await db
      .insert(invoices)
      .values({
        orgId, gstinId: g!.id, vendorId: cust!.id, invoiceNumber: `ORIG-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "tax_invoice",
        supplierGstin: g!.gstin, buyerGstin: opts.buyerGstin, placeOfSupply: opts.pos,
        taxableValue: "10000", ...tax, totalTaxAmount: "1800", amount: "11800",
        invoiceDate: new Date(2026, 0, 10), // FY 2025-26 → s.34 deadline 30 Nov 2026
      })
      .returning();
    await db.insert(invoiceLineItems).values({
      invoiceId: orig!.id, lineItemNumber: 1, description: "Service", hsnSacCode: "998314",
      taxableValue: "10000", gstRate: "18", ...tax, lineTotal: "11800",
    });
    return { gstin: g!, original: orig! };
  }

  async function jeLinesByCode(noteNumber: string) {
    const db = testDb();
    const [je] = await db.select().from(journalEntries).where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.reference, noteNumber)));
    if (!je) return null;
    const lines = await db
      .select({ code: chartOfAccounts.code, debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount })
      .from(journalEntryLines)
      .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
      .where(eq(journalEntryLines.journalEntryId, je.id));
    const byCode: Record<string, { debit: number; credit: number }> = {};
    for (const l of lines) byCode[l.code] = { debit: Number(l.debit), credit: Number(l.credit) };
    return { je, byCode };
  }

  it("posts the CA reversal: Dr Sales Returns(4130) + Dr Output IGST + Cr AR(1130), balanced", async () => {
    const { original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29", interstate: true });
    const noteNumber = `CN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-02-15",
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 2000, gstRate: 18 }],
    });
    const res = (await jeLinesByCode(noteNumber))!;
    expect(res).not.toBeNull();
    expect(res.byCode["4130"]).toEqual({ debit: 2000, credit: 0 });   // contra-revenue, NOT gross sales
    expect(res.byCode["2121"]).toEqual({ debit: 360, credit: 0 });    // output IGST reversed
    expect(res.byCode["1130"]).toEqual({ debit: 0, credit: 2360 });   // AR credited
    expect(res.byCode["4100"]).toBeUndefined();                       // gross sales untouched
    expect(Number(res.je.totalDebit)).toBe(Number(res.je.totalCredit));
  });

  it("intra-state credit note reverses CGST + SGST", async () => {
    const { original } = await seedOriginal({ buyerGstin: null, buyerState: "Maharashtra", pos: "27", interstate: false });
    const noteNumber = `CN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-02-15",
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 1000, gstRate: 18 }],
    });
    const res = (await jeLinesByCode(noteNumber))!;
    expect(res.byCode["4130"].debit).toBe(1000);
    expect(res.byCode["2122"].debit).toBe(90);
    expect(res.byCode["2123"].debit).toBe(90);
    expect(res.byCode["1130"].credit).toBe(1180);
  });

  it("dates the entry to the note's own period, never the original's", async () => {
    const { original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29", interstate: true });
    const noteNumber = `CN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-05-20",
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 1000, gstRate: 18 }],
    });
    const res = (await jeLinesByCode(noteNumber))!;
    expect(new Date(res.je.date).getMonth()).toBe(4); // May, not January (original)
  });

  it("TIME LIMIT: a credit note after 30 Nov becomes financial — no tax legs, notice, out of Table 9", async () => {
    const { gstin, original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29", interstate: true });
    const noteNumber = `CN-${nanoid(5)}`;
    const note = await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-12-15", // past 30 Nov 2026
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 2000, gstRate: 18 }],
    });
    // Persisted with no tax, flagged financial, and a clear notice returned.
    expect(note.isFinancialNote).toBe(true);
    expect(Number(note.totalTaxAmount)).toBe(0);
    expect(note.financialNoteNotice).toMatch(/financial credit note/i);
    // Journal: contra-revenue + AR only, no output-tax debit.
    const res = (await jeLinesByCode(noteNumber))!;
    expect(res.byCode["4130"]).toEqual({ debit: 2000, credit: 0 });
    expect(res.byCode["1130"]).toEqual({ debit: 0, credit: 2000 });
    expect(res.byCode["2121"]).toBeUndefined();
    // And it is excluded from GSTR-1 Table 9.
    const gstr = await acct.gstr.generateGSTR1({ gstinId: gstin.id, month: 12, year: 2026 });
    expect(gstr.payload.cdnr.flatMap((g: any) => g.nt).some((n: any) => n.nt_num === noteNumber)).toBe(false);
  });

  it("VALUE CAP: cumulative credit notes cannot exceed the invoice's taxable/tax", async () => {
    const { original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29", interstate: true });
    // First note ₹8,000 of the ₹10,000 taxable — OK.
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`, noteDate: "2026-02-15",
      lines: [{ description: "Part 1", hsnSacCode: "998314", taxableValue: 8000, gstRate: 18 }],
    });
    // Second note ₹3,000 would push cumulative to ₹11,000 > ₹10,000 — rejected.
    await expect(
      fin.createCreditDebitNote({
        originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`, noteDate: "2026-02-16",
        lines: [{ description: "Part 2", hsnSacCode: "998314", taxableValue: 3000, gstRate: 18 }],
      }),
    ).rejects.toThrow(/would exceed the invoice/i);
  });

  it("RATE IN FORCE: a note at a rate not on the original is rejected", async () => {
    const { original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29", interstate: true });
    // Original was at 18%; crediting at 12% (a later rate change) must be refused.
    await expect(
      fin.createCreditDebitNote({
        originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`, noteDate: "2026-02-15",
        lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 2000, gstRate: 12 }],
      }),
    ).rejects.toThrow(/not in force/i);
  });
});
