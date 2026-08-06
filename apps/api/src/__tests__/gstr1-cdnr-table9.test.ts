/**
 * GSTR-1 Table 9 (credit/debit notes — CDNR/CDNUR) — Part 4 fairness (C7-3).
 *
 * Before this: the builder ignored invoiceType, so a credit/debit note would be
 * mis-reported as a positive B2B/B2CS supply and there was no cdnr/cdnur section.
 * Now notes route to Table 9 (CDNR when the buyer is registered, CDNUR when not),
 * carry the note type + original ref, are kept OUT of the supply tables, and their
 * lines are excluded from the Table 12 HSN summary (no overstated turnover).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { financialRouter } from "../routers/financial";
import { gstinRegistry, invoices, invoiceLineItems, vendors } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("GSTR-1 Table 9 — credit/debit notes", () => {
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
  });

  async function seedOriginal(opts: { buyerGstin: string | null; buyerState: string; pos: string }) {
    const db = testDb();
    const [g] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "27AAAAA0000A1Z5", legalName: "Co", stateCode: "27", stateName: "Maharashtra", isPrimary: true })
      .returning();
    const [cust] = await db
      .insert(vendors)
      .values({ orgId, name: "Customer", state: opts.buyerState, gstin: opts.buyerGstin })
      .returning();
    const [orig] = await db
      .insert(invoices)
      .values({
        orgId, gstinId: g!.id, vendorId: cust!.id, invoiceNumber: `ORIG-${nanoid(4)}`,
        invoiceFlow: "receivable", invoiceType: "tax_invoice",
        supplierGstin: g!.gstin, buyerGstin: opts.buyerGstin, placeOfSupply: opts.pos,
        taxableValue: "10000", igstAmount: "1800", cgstAmount: "0", sgstAmount: "0",
        totalTaxAmount: "1800", amount: "11800", invoiceDate: new Date(2026, 0, 10),
      })
      .returning();
    await db.insert(invoiceLineItems).values({
      invoiceId: orig!.id, lineItemNumber: 1, description: "Service", hsnSacCode: "998314",
      taxableValue: "10000", gstRate: "18", igstAmount: "1800", cgstAmount: "0", sgstAmount: "0", lineTotal: "11800",
    });
    return { gstin: g!, original: orig! };
  }

  it("a registered credit note lands in CDNR (Table 9), not the supply tables", async () => {
    const { gstin, original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29" });
    const noteNumber = `CN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-01-20",
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 2000, gstRate: 18 }],
    });

    const res = await acct.gstr.generateGSTR1({ gstinId: gstin.id, month: 1, year: 2026 });
    const grp = res.payload.cdnr.find((g: any) => g.ctin === "29BBBBB1111B1Z3");
    expect(grp).toBeDefined();
    const nt = grp.nt.find((n: any) => n.nt_num === noteNumber);
    expect(nt).toBeDefined();
    expect(nt.ntty).toBe("C");
    expect(nt.onum).toBe(original.invoiceNumber);
    expect(nt.odt).toBeTruthy();

    // Not double-reported as a supply.
    const inB2b = res.payload.b2b.some((g: any) => g.inv.some((i: any) => i.inum === noteNumber));
    expect(inB2b).toBe(false);
  });

  it("a debit note carries ntty 'D'", async () => {
    const { gstin, original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29" });
    const noteNumber = `DN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "debit_note", noteNumber, noteDate: "2026-01-20",
      lines: [{ description: "Undercharge", hsnSacCode: "998314", taxableValue: 500, gstRate: 18 }],
    });
    const res = await acct.gstr.generateGSTR1({ gstinId: gstin.id, month: 1, year: 2026 });
    const nt = res.payload.cdnr.flatMap((g: any) => g.nt).find((n: any) => n.nt_num === noteNumber);
    expect(nt.ntty).toBe("D");
  });

  it("an unregistered-buyer note lands in CDNUR", async () => {
    const { gstin, original } = await seedOriginal({ buyerGstin: null, buyerState: "Karnataka", pos: "29" });
    const noteNumber = `CN-${nanoid(5)}`;
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber, noteDate: "2026-01-20",
      lines: [{ description: "Refund", hsnSacCode: "998314", taxableValue: 1500, gstRate: 18 }],
    });
    const res = await acct.gstr.generateGSTR1({ gstinId: gstin.id, month: 1, year: 2026 });
    expect(res.payload.cdnur.some((n: any) => n.nt_num === noteNumber)).toBe(true);
    expect(res.payload.cdnr.length).toBe(0);
  });

  it("the note's lines are excluded from the Table 12 HSN summary (no overstated turnover)", async () => {
    const { gstin, original } = await seedOriginal({ buyerGstin: "29BBBBB1111B1Z3", buyerState: "Karnataka", pos: "29" });
    await fin.createCreditDebitNote({
      originalInvoiceId: original.id, noteType: "credit_note", noteNumber: `CN-${nanoid(5)}`, noteDate: "2026-01-20",
      lines: [{ description: "Discount", hsnSacCode: "998314", taxableValue: 2000, gstRate: 18 }],
    });
    const res = await acct.gstr.generateGSTR1({ gstinId: gstin.id, month: 1, year: 2026 });
    const hsn = res.payload.hsn.data.find((r: any) => r.hsn_sc === "998314");
    // Only the original's ₹10,000 — the note's ₹2,000 is NOT added in.
    expect(hsn.txval).toBe(10000);
  });
});
