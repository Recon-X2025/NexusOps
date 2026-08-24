/**
 * A supplier below the GST registration threshold must still be able to bill.
 *
 * GST registration is threshold-based (broadly Rs.40L goods / Rs.20L services),
 * so a small business is not "unconfigured" — it is lawfully UNREGISTERED. Such
 * a supplier issues a BILL OF SUPPLY under Rule 49: no GSTIN, no tax breakup,
 * because it collects no tax.
 *
 * The product could previously only produce a tax invoice: `invoice_type` had no
 * bill-of-supply value, all three creators hardcoded "tax_invoice", and the
 * document helper hard-required a supplier GSTIN citing Rule 46(a). The net
 * effect was that an unregistered tenant could create invoice records and then
 * issue nothing at all — the whole below-threshold segment locked out.
 *
 * The most dangerous half is the tax: an unregistered supplier's document must
 * NOT state CGST/SGST/IGST. That is not a cosmetic defect — it asserts tax the
 * supplier has no authority to collect.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "@coheronconnect/db";
import { invoices, vendors, gstinRegistry } from "@coheronconnect/db";
import { appRouter } from "../routers";
import { assertInvoiceDocumentBasis } from "../http/financial-invoice-pdf";
import { seedFullOrg, makeContext, testDb, cleanupOrg } from "./helpers";
import { nanoid } from "nanoid";

type Caller = ReturnType<typeof appRouter.createCaller>;

describe("Bill of supply — an unregistered supplier can still bill", () => {
  let orgId: string;
  let caller: Caller;
  let customerId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = appRouter.createCaller(makeContext(seeded.adminId, orgId));
    const [v] = await testDb()
      .insert(vendors)
      .values({ orgId, name: `Customer ${nanoid(4)}`, state: "Karnataka" })
      .returning();
    customerId = v!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function registerGstin() {
    await testDb().insert(gstinRegistry).values({
      orgId,
      gstin: "29AABCU9603R1ZM",
      legalName: "Registered Co",
      stateCode: "29",
      stateName: "Karnataka",
      isPrimary: true,
      isActive: true,
    });
  }

  const raise = async () =>
    caller.financial.createReceivableInvoice({
      customerVendorId: customerId,
      invoiceNumber: `AR-${nanoid(6)}`,
      amount: "10000",
      gstRate: 18,
      lines: [
        {
          description: "Consulting",
          taxableValue: 10000,
          gstRate: 18,
          hsnSacCode: "998313",
          quantity: 1,
          unitPrice: 10000,
        },
      ],
    } as never);

  const row = async (id: string) => {
    const [r] = await testDb().select().from(invoices).where(eq(invoices.id, id));
    return r!;
  };

  it("issues a BILL OF SUPPLY when the org has no GSTIN", async () => {
    const created = await raise();
    expect((await row(created.id)).invoiceType).toBe("bill_of_supply");
  });

  it("charges NO GST on a bill of supply", async () => {
    const created = await raise();
    const r = await row(created.id);
    expect(Number(r.cgstAmount ?? 0)).toBe(0);
    expect(Number(r.sgstAmount ?? 0)).toBe(0);
    expect(Number(r.igstAmount ?? 0)).toBe(0);
    expect(Number(r.totalTaxAmount ?? 0)).toBe(0);
    // The customer owes the taxable value and nothing more.
    expect(Number(r.amount)).toBe(Number(r.taxableValue));
  });

  it("still issues a TAX INVOICE, with tax, once a GSTIN is registered", async () => {
    await registerGstin();
    const created = await raise();
    const r = await row(created.id);
    expect(r.invoiceType).toBe("tax_invoice");
    expect(Number(r.totalTaxAmount ?? 0)).toBeGreaterThan(0);
    expect(Number(r.amount)).toBeGreaterThan(Number(r.taxableValue));
  });

  it("does not demand a GSTIN before issuing a bill of supply", () => {
    // Rule 46(a) governs the TAX INVOICE. Applying it to a bill of supply is what
    // locked unregistered suppliers out of billing entirely.
    expect(
      assertInvoiceDocumentBasis({
        invoiceFlow: "receivable",
        invoiceType: "bill_of_supply",
        supplierGstin: null,
        placeOfSupply: null,
        lineCount: 1,
      }),
    ).toBeNull();
  });

  it("still demands a GSTIN for a tax invoice", () => {
    const block = assertInvoiceDocumentBasis({
      invoiceFlow: "receivable",
      invoiceType: "tax_invoice",
      supplierGstin: null,
      placeOfSupply: "29",
      lineCount: 1,
    });
    expect(block?.field).toBe("invoice.supplierGstin");
  });

  it("refuses a bill of supply with no lines, like any document", () => {
    const block = assertInvoiceDocumentBasis({
      invoiceFlow: "receivable",
      invoiceType: "bill_of_supply",
      supplierGstin: null,
      placeOfSupply: null,
      lineCount: 0,
    });
    expect(block?.field).toBe("invoice.lines");
  });

  it("never issues either document for a payable", () => {
    for (const t of ["tax_invoice", "bill_of_supply"] as const) {
      const block = assertInvoiceDocumentBasis({
        invoiceFlow: "payable",
        invoiceType: t,
        supplierGstin: "29AABCU9603R1ZM",
        placeOfSupply: "29",
        lineCount: 1,
      });
      expect(block?.field).toBe("invoice.invoiceFlow");
    }
  });
});
