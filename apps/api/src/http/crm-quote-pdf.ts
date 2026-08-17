/**
 * Authenticated HTTP download for a CRM quotation PDF.
 * Proxied from Next.js at `/api/crm/quote-pdf/[id]`.
 *
 * Mirrors `payroll-payslip-pdf.ts` exactly — same auth via `createContext`, same
 * org scoping, same PDFKit-buffer-then-`reply.send` delivery. No second PDF
 * mechanism is introduced.
 *
 * ── The refusal ─────────────────────────────────────────────────────────────
 * This route will NOT produce a document when the tax basis cannot be verified.
 *
 * `crm_quotes.placeOfSupply` is stored as `buyerState ?? orgState ?? null`
 * (`lib/crm/quote-tax.ts`), so a quote whose account has no state on file silently
 * takes the SELLER's own state and `isInterstate: false`. The stored row then
 * looks entirely normal: a confident CGST/SGST split, correct arithmetic, wrong
 * basis. On screen that is recoverable. On a PDF mailed to a customer it is a
 * document asserting a tax treatment nobody verified, and the customer may claim
 * input credit against it.
 *
 * A banner was the alternative and was rejected: a warning can be cropped,
 * ignored, or lost when the page is forwarded, whereas a document that was never
 * generated cannot be sent. So the conditions below are hard 409s that name the
 * specific field to fix. The screen disables the control for the same reasons so
 * this is an explanation, not a surprise.
 */

import type { FastifyInstance } from "fastify";
import {
  and,
  eq,
  desc,
  crmQuotes,
  crmDeals,
  crmAccounts,
  gstinRegistry,
} from "@coheronconnect/db";
import { createContext } from "../middleware/auth";
import { generateQuotePDF, type QuotePdfLine } from "../services/quote-pdf";
import { gstStateName } from "../lib/crm/quote-tax";
import { normaliseGstStateOrWarn } from "../lib/india/gst-engine";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Why a quote cannot be turned into a document, in words the salesperson can act on. */
export type QuoteDocumentBlock = { field: string; message: string } | null;

/**
 * The single source of truth for "is this quote sendable". The HTTP route
 * enforces it and `crm.deals.quotes.list` reports it, so the button's disabled
 * state and the server's refusal can never disagree.
 */
export function assertQuoteDocumentBasis(args: {
  sellerGstin: string | null;
  sellerStateCode: string | null;
  hasAccount: boolean;
  accountName: string | null;
  buyerRawState: string | null;
  buyerStateCode: string | null;
}): QuoteDocumentBlock {
  if (!args.sellerGstin || !args.sellerStateCode) {
    return {
      field: "org.gstin",
      message:
        "This organisation has no active GSTIN on file, so a quotation cannot state a supplier GSTIN or a place of supply. Add a GSTIN under Finance → GST registrations.",
    };
  }
  if (!args.hasAccount) {
    return {
      field: "quote.account",
      message:
        "This quote is not linked to a customer account, so it has no billing party and no state to determine the tax split. Link the quote's deal to an account first.",
    };
  }
  if (!args.buyerRawState) {
    return {
      field: "account.stateCode",
      message: `${args.accountName ?? "The customer account"} has no state on file. Without it the tax split defaults to intra-state (CGST + SGST) unverified, which may be wrong. Set the account's state, then download.`,
    };
  }
  if (!args.buyerStateCode) {
    return {
      field: "account.stateCode",
      message: `${args.accountName ?? "The customer account"} has the state "${args.buyerRawState}", which is not a recognised GST state. The tax split cannot be verified against it. Correct the account's state, then download.`,
    };
  }
  return null;
}

export function registerCrmQuotePdfRoute(fastify: FastifyInstance): void {
  fastify.get<{ Params: { id: string } }>("/crm/quote-pdf/:id", async (req, reply) => {
    const ctx = await createContext(req);
    if (!ctx.user?.id || !ctx.orgId) {
      return reply.status(401).send("Unauthorized");
    }

    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      return reply.status(400).send("Invalid quote id");
    }

    const { db } = ctx;
    const orgId = ctx.orgId;

    const [quote] = await db
      .select()
      .from(crmQuotes)
      .where(and(eq(crmQuotes.id, id), eq(crmQuotes.orgId, orgId)))
      .limit(1);
    if (!quote) {
      return reply.status(404).send("Quote not found");
    }

    // Supplier identity: the primary active GSTIN, same selection rule as
    // `resolveOrgState` so the document and the stored split agree on which
    // registration this supply came from.
    const [seller] = await db
      .select()
      .from(gstinRegistry)
      .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.isActive, true)))
      .orderBy(desc(gstinRegistry.isPrimary), gstinRegistry.createdAt)
      .limit(1);

    // Buyer: the quote's deal → account.
    let buyerRow: { name: string; billingAddress: string | null; gstin: string | null; stateCode: string | null } | null =
      null;
    if (quote.dealId) {
      const [row] = await db
        .select({
          name: crmAccounts.name,
          billingAddress: crmAccounts.billingAddress,
          gstin: crmAccounts.gstin,
          stateCode: crmAccounts.stateCode,
        })
        .from(crmDeals)
        .innerJoin(crmAccounts, eq(crmDeals.accountId, crmAccounts.id))
        .where(and(eq(crmDeals.id, quote.dealId), eq(crmDeals.orgId, orgId)))
        .limit(1);
      buyerRow = row ?? null;
    }

    const buyerStateCode = normaliseGstStateOrWarn(buyerRow?.stateCode ?? null, "quote-pdf.buyer");
    const block = assertQuoteDocumentBasis({
      sellerGstin: seller?.gstin ?? null,
      sellerStateCode: seller?.stateCode ?? null,
      hasAccount: buyerRow !== null,
      accountName: buyerRow?.name ?? null,
      buyerRawState: buyerRow?.stateCode ?? null,
      buyerStateCode,
    });
    if (block) {
      return reply
        .status(409)
        .header("Content-Type", "application/json")
        .send({ error: "QUOTE_TAX_BASIS_UNVERIFIED", field: block.field, message: block.message });
    }

    const storedItems = Array.isArray(quote.items) ? quote.items : [];
    const lines: QuotePdfLine[] = storedItems.map((i) => ({
      description: i.description ?? "",
      hsnCode: i.hsnCode ?? null,
      quantity: Number(i.quantity ?? 0),
      unitPrice: Number(i.unitPrice ?? 0),
      discountPct: Number(i.discountPct ?? 0),
      gross: Number(i.total ?? 0),
      gstRate: Number(i.gstRate ?? 0),
    }));

    const placeCode = quote.placeOfSupply ?? null;
    const placeName = gstStateName(placeCode);

    try {
      const buffer = await generateQuotePDF({
        seller: {
          legalName: seller!.legalName,
          gstin: seller!.gstin,
          stateCode: seller!.stateCode,
          stateName: seller!.stateName ?? gstStateName(seller!.stateCode),
          address: seller!.address ?? null,
        },
        buyer: {
          name: buyerRow!.name,
          address: buyerRow!.billingAddress,
          gstin: buyerRow!.gstin,
          stateName: gstStateName(buyerStateCode),
        },
        quote: {
          number: quote.quoteNumber,
          date: quote.createdAt,
          validUntil: quote.validUntil,
          notes: quote.notes,
        },
        lines,
        totals: {
          subtotal: Number(quote.subtotal),
          discountPct: Number(quote.discountPct ?? 0),
          taxableValue: Number(quote.taxableValue),
          cgst: Number(quote.cgstAmount),
          sgst: Number(quote.sgstAmount),
          igst: Number(quote.igstAmount),
          taxTotal: Number(quote.taxTotal),
          total: Number(quote.total),
        },
        placeOfSupply: placeName ? `${placeName}${placeCode ? ` (${placeCode})` : ""}` : placeCode,
        isInterstate: quote.isInterstate,
      });

      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="quote-${quote.quoteNumber}.pdf"`)
        .header("Cache-Control", "private, no-store");
      return reply.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[crm-quote-pdf] generation failed");
      return reply.status(500).send("Could not generate the quotation PDF");
    }
  });
}
