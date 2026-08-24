/**
 * Authenticated HTTP download for a TAX INVOICE PDF.
 * Proxied from Next.js at `/api/financial/invoice-pdf/[id]`.
 *
 * Mirrors `payroll-payslip-pdf.ts` and `crm-quote-pdf.ts` — same auth, same org
 * scoping, same PDFKit-buffer delivery. No new mechanism, and no filing: the IRN
 * round-trip already belongs to the `coheronconnect-irn-generation` BullMQ
 * pipeline, and this route only PRINTS what that pipeline stored.
 *
 * ── What it refuses, and why ────────────────────────────────────────────────
 * A tax invoice is a statutory document. Issuing a defective one is worse than
 * issuing none, so the route answers 409 with the field to fix rather than
 * rendering something that merely looks complete:
 *
 *   1. AP invoices. `invoiceFlow = "payable"` is a bill the VENDOR issued to us.
 *      Generating "our" tax invoice for it would be fabricating someone else's
 *      statutory document under our letterhead.
 *   2. No supplier GSTIN, or no place of supply. Rule 46(a) and 46(n). Without
 *      them the CGST/SGST-vs-IGST split on the page is unverifiable.
 *   3. No line items. Rule 46(g)(h)(i) require HSN/SAC, description and
 *      quantity per line. `invoices.lines` is an OPTIONAL input on
 *      `financial.createGSTInvoice`, and the web invoice form does not send it,
 *      so invoices created by clicking currently have none. Printing them would
 *      produce a non-compliant invoice silently; refusing names the gap.
 */

import type { FastifyInstance } from "fastify";
import {
  and,
  eq,
  asc,
  desc,
  invoices,
  invoiceLineItems,
  vendors,
  gstinRegistry,
} from "@coheronconnect/db";
import { createContext } from "../middleware/auth";
import { generateInvoicePDF, type InvoicePdfLine } from "../services/invoice-pdf";
import { gstStateName } from "../lib/crm/quote-tax";
import { round2 } from "../services/pdf-money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvoiceDocumentBlock = { field: string; message: string } | null;

/**
 * The single source of truth for "is this invoice issuable as a document".
 * Exported so the screen and the route cannot disagree about why.
 */
export function assertInvoiceDocumentBasis(args: {
  invoiceFlow: string;
  /** "tax_invoice" (Rule 46) or "bill_of_supply" (Rule 49). */
  invoiceType?: string | null;
  supplierGstin: string | null;
  placeOfSupply: string | null;
  lineCount: number;
}): InvoiceDocumentBlock {
  if (args.invoiceFlow !== "receivable") {
    return {
      field: "invoice.invoiceFlow",
      message:
        "This is a payable (vendor) invoice — the tax invoice for it was issued by your supplier, not by you. Only receivable invoices can be printed as your own tax invoice.",
    };
  }
  // A BILL OF SUPPLY (Rule 49) is what a supplier who is NOT GST-registered
  // issues. It carries no GSTIN and no tax, so the Rule 46 particulars below —
  // supplier GSTIN and place of supply, which exist to justify a tax charge —
  // do not apply and must not be demanded. Requiring them here is what stopped
  // every below-threshold tenant from issuing any document at all.
  const isBillOfSupply = args.invoiceType === "bill_of_supply";
  if (!isBillOfSupply && !args.supplierGstin) {
    return {
      field: "invoice.supplierGstin",
      message:
        "This invoice carries no supplier GSTIN, which Rule 46(a) requires. Register your GSTIN under Finance → GST Registrations and raise the invoice again.",
    };
  }
  if (!isBillOfSupply && !args.placeOfSupply) {
    return {
      field: "invoice.placeOfSupply",
      message:
        "This invoice has no place of supply, which Rule 46(n) requires and which decides the CGST/SGST-vs-IGST split. The customer's state must be on file before a tax invoice can be issued.",
    };
  }
  if (args.lineCount === 0) {
    return {
      field: "invoice.lines",
      message:
        "This invoice has no line items, so it cannot state HSN/SAC, description or quantity — all required by Rule 46(g), (h) and (i). It was created without lines; add them before issuing a tax invoice.",
    };
  }
  return null;
}

export function registerFinancialInvoicePdfRoute(fastify: FastifyInstance): void {
  fastify.get<{ Params: { id: string } }>("/financial/invoice-pdf/:id", async (req, reply) => {
    const ctx = await createContext(req);
    if (!ctx.user?.id || !ctx.orgId) {
      return reply.status(401).send("Unauthorized");
    }

    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      return reply.status(400).send("Invalid invoice id");
    }

    const { db } = ctx;
    const orgId = ctx.orgId;

    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
      .limit(1);
    if (!inv) {
      return reply.status(404).send("Invoice not found");
    }

    const lineRows = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id))
      .orderBy(asc(invoiceLineItems.lineItemNumber));

    const block = assertInvoiceDocumentBasis({
      invoiceFlow: inv.invoiceFlow,
      invoiceType: inv.invoiceType,
      supplierGstin: inv.supplierGstin,
      placeOfSupply: inv.placeOfSupply,
      lineCount: lineRows.length,
    });
    if (block) {
      return reply
        .status(409)
        .header("Content-Type", "application/json")
        .send({ error: "INVOICE_NOT_ISSUABLE", field: block.field, message: block.message });
    }

    // Supplier identity: the registration stamped on the invoice when possible,
    // otherwise the org's primary active GSTIN.
    const [sellerRow] = inv.gstinId
      ? await db.select().from(gstinRegistry).where(eq(gstinRegistry.id, inv.gstinId)).limit(1)
      : await db
          .select()
          .from(gstinRegistry)
          .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.isActive, true)))
          .orderBy(desc(gstinRegistry.isPrimary), gstinRegistry.createdAt)
          .limit(1);

    const [counterparty] = await db
      .select({ name: vendors.name, address: vendors.address, state: vendors.state, gstin: vendors.gstin })
      .from(vendors)
      .where(and(eq(vendors.id, inv.vendorId), eq(vendors.orgId, orgId)))
      .limit(1);

    const lines: InvoicePdfLine[] = lineRows.map((l) => ({
      description: l.description,
      hsnSacCode: l.hsnSacCode,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      discountPercent: Number(l.discountPercent),
      taxableValue: Number(l.taxableValue),
      gstRate: Number(l.gstRate),
    }));

    const taxableValue = Number(inv.taxableValue);
    const taxTotal = Number(inv.totalTaxAmount);
    const placeName = gstStateName(inv.placeOfSupply);

    const titleByType: Record<string, string> = {
      credit_note: "CREDIT NOTE",
      debit_note: "DEBIT NOTE",
      // Rule 49. An unregistered supplier's document must not call itself a tax
      // invoice — it charges no tax and cites no GSTIN.
      bill_of_supply: "BILL OF SUPPLY",
    };
    const documentTitle = titleByType[(inv as { invoiceType?: string }).invoiceType ?? ""] ?? "TAX INVOICE";

    try {
      const buffer = await generateInvoicePDF({
        seller: {
          legalName: sellerRow?.legalName ?? "",
          gstin: inv.supplierGstin ?? null,
          stateName: sellerRow?.stateName ?? gstStateName(sellerRow?.stateCode ?? null),
          stateCode: sellerRow?.stateCode ?? null,
          address: sellerRow?.address ?? null,
        },
        buyer: {
          name: counterparty?.name ?? "Customer",
          address: counterparty?.address ?? null,
          gstin: inv.buyerGstin ?? counterparty?.gstin ?? null,
          stateName: counterparty?.state ?? null,
        },
        invoice: {
          number: inv.invoiceNumber,
          date: inv.createdAt,
          dueDate: inv.dueDate ?? null,
          documentTitle,
          originalInvoiceNumber: inv.originalInvoiceNumber ?? null,
          originalInvoiceDate: inv.originalInvoiceDate ?? null,
          isReverseCharge: inv.isReverseCharge,
        },
        lines,
        totals: {
          taxableValue,
          cgst: Number(inv.cgstAmount),
          sgst: Number(inv.sgstAmount),
          igst: Number(inv.igstAmount),
          taxTotal,
          total: round2(taxableValue + taxTotal),
          tdsDeducted: Number(inv.tdsDeducted),
        },
        placeOfSupply: placeName
          ? `${placeName} (${inv.placeOfSupply})`
          : inv.placeOfSupply,
        isInterstate: inv.isInterstate,
        // A bill of supply charges no tax, so the renderer must not print a rate
        // column, a rate-wise summary or a CGST/SGST/IGST total on it.
        chargesNoTax: (inv as { invoiceType?: string }).invoiceType === "bill_of_supply",
        eInvoice: {
          irn: inv.eInvoiceIrn ?? null,
          ackNumber: inv.eInvoiceAckNumber ?? null,
          ackDate: inv.eInvoiceAckDate ?? null,
          status: inv.eInvoiceStatus ?? null,
        },
      });

      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="invoice-${inv.invoiceNumber}.pdf"`)
        .header("Cache-Control", "private, no-store");
      return reply.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[financial-invoice-pdf] generation failed");
      return reply.status(500).send("Could not generate the tax invoice PDF");
    }
  });
}
