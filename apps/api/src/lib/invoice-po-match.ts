import { TRPCError } from "@trpc/server";
import type { Db } from "@nexusops/db";
import {
  invoices,
  purchaseOrders,
  invoiceLineItems,
  poLineItems,
  grnLineItems,
  organizations,
  eq,
  and,
  inArray,
} from "@nexusops/db";
import { getProcurementMatchToleranceAbs } from "./org-settings";

export type InvoicePoMatchResult = {
  invoice: typeof invoices.$inferSelect;
  po: typeof purchaseOrders.$inferSelect;
  matched: boolean;
  discrepancy: number;
  toleranceUsed: number;
  discrepancyPct: number;
  invoiceLineSum: number;
  poLineSum: number;
  poLineCount: number;
  invoiceLineCount: number;
  poInvoiceLineDelta: number | null;
  lineKeyedMatched: boolean | null;
  lineMatchRows: Array<{
    lineIndex: number;
    invoiceLineNumber: number | null;
    poLineId: string | null;
    invoiceLineTotal: number | null;
    poLineExtended: number | null;
    grnLineValue: number | null;
    poInvoiceDelta: number | null;
    threeWayDelta: number | null;
    ok: boolean;
  }> | null;
  grnReceivedValue: number | null;
};

/**
 * Shared PO ↔ AP invoice three-way match (query + persist). Loads fresh org tolerance from Postgres.
 */
export async function computeInvoicePoMatch(
  db: Db,
  orgId: string,
  invoiceId: string,
  poId: string,
): Promise<InvoicePoMatchResult> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.orgId, orgId)));

  if (!invoice || !po) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invoice or purchase order not found" });
  }

  const [orgRowMatch] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const tolerance = getProcurementMatchToleranceAbs(orgRowMatch?.settings);
  const invoiceTotal = parseFloat(invoice.amount);
  const poTotal = parseFloat(po.totalAmount);
  const discrepancy = Math.abs(invoiceTotal - poTotal);
  let matched = discrepancy <= tolerance;

  const lines = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id));
  const invoiceLineSum = lines.reduce(
    (s: number, li: (typeof lines)[number]) => s + parseFloat(String(li.lineTotal)),
    0,
  );
  const lineDelta = lines.length > 0 ? Math.abs(invoiceTotal - invoiceLineSum) : 0;

  const poLines = await db.select().from(poLineItems).where(eq(poLineItems.poId, po.id));
  const poLineSum = poLines.reduce(
    (s: number, li: (typeof poLines)[number]) => s + Number(li.quantity ?? 0) * parseFloat(String(li.unitPrice ?? 0)),
    0,
  );
  const poInvoiceLineDelta =
    lines.length > 0 && poLines.length > 0 ? Math.abs(poLineSum - invoiceLineSum) : 0;

  const invSorted = [...lines].sort((a, b) => a.lineItemNumber - b.lineItemNumber);
  const poSorted = [...poLines].sort((a, b) => a.id.localeCompare(b.id));

  let lineKeyedMatched = true;
  const lineMatchRows: InvoicePoMatchResult["lineMatchRows"] = [];

  const grnByPoLine = new Map<string, number>();
  if (invoice.grnId) {
    const grnLinesAll = await db.select().from(grnLineItems).where(eq(grnLineItems.grnId, invoice.grnId));
    const poLineIds = [...new Set(grnLinesAll.map((g) => g.poLineItemId).filter(Boolean))] as string[];
    const priceByPolId = new Map<string, number>();
    if (poLineIds.length > 0) {
      const polRows = await db.select().from(poLineItems).where(inArray(poLineItems.id, poLineIds));
      for (const p of polRows) {
        priceByPolId.set(p.id, parseFloat(String(p.unitPrice)));
      }
    }
    for (const gl of grnLinesAll) {
      if (!gl.poLineItemId) continue;
      const up = priceByPolId.get(gl.poLineItemId) ?? 0;
      const add = Number(gl.acceptedQuantity ?? 0) * up;
      grnByPoLine.set(gl.poLineItemId, (grnByPoLine.get(gl.poLineItemId) ?? 0) + add);
    }
  }

  if (lines.length > 0 && poLines.length > 0) {
    if (invSorted.length !== poSorted.length) {
      lineKeyedMatched = false;
    }
    const n = Math.max(invSorted.length, poSorted.length);
    for (let i = 0; i < n; i++) {
      const invL = invSorted[i];
      const poL = poSorted[i];
      if (!invL || !poL) {
        lineKeyedMatched = false;
        lineMatchRows!.push({
          lineIndex: i,
          invoiceLineNumber: invL?.lineItemNumber ?? null,
          poLineId: poL?.id ?? null,
          invoiceLineTotal: invL ? parseFloat(String(invL.lineTotal)) : null,
          poLineExtended: poL ? Number(poL.quantity) * parseFloat(String(poL.unitPrice)) : null,
          grnLineValue: poL ? grnByPoLine.get(poL.id) ?? null : null,
          poInvoiceDelta: null,
          threeWayDelta: null,
          ok: false,
        });
        continue;
      }
      const invAmt = parseFloat(String(invL.lineTotal));
      const poAmt = Number(poL.quantity) * parseFloat(String(poL.unitPrice));
      const poInvD = Math.abs(invAmt - poAmt);
      let rowOk = poInvD <= tolerance;
      let grnVal: number | null = null;
      let threeWayD: number | null = null;
      if (invoice.grnId) {
        grnVal = grnByPoLine.get(poL.id) ?? 0;
        threeWayD = Math.abs(invAmt - grnVal);
        rowOk = rowOk && threeWayD <= tolerance;
      }
      if (!rowOk) lineKeyedMatched = false;
      lineMatchRows!.push({
        lineIndex: i,
        invoiceLineNumber: invL.lineItemNumber,
        poLineId: poL.id,
        invoiceLineTotal: invAmt,
        poLineExtended: poAmt,
        grnLineValue: grnVal,
        poInvoiceDelta: poInvD,
        threeWayDelta: threeWayD,
        ok: rowOk,
      });
    }
    matched = matched && lineKeyedMatched;
  }

  let grnReceivedValue: number | null = null;
  if (invoice.grnId) {
    let recv = 0;
    for (const v of grnByPoLine.values()) {
      recv += v;
    }
    grnReceivedValue = recv;
    const threeWayGap = Math.abs(invoiceTotal - recv);
    const lineAware = lines.length > 0 && poLines.length > 0 ? lineKeyedMatched : poInvoiceLineDelta <= tolerance;
    matched =
      matched &&
      threeWayGap <= tolerance &&
      (lines.length === 0 || lineDelta <= tolerance) &&
      lineAware;
  }

  return {
    invoice,
    po,
    matched,
    discrepancy,
    toleranceUsed: tolerance,
    discrepancyPct: poTotal > 0 ? Math.round((discrepancy / poTotal) * 100) : 0,
    invoiceLineSum,
    poLineSum,
    poLineCount: poLines.length,
    invoiceLineCount: lines.length,
    poInvoiceLineDelta: lines.length > 0 && poLines.length > 0 ? poInvoiceLineDelta : null,
    lineKeyedMatched: lines.length > 0 && poLines.length > 0 ? lineKeyedMatched : null,
    lineMatchRows: lineMatchRows!.length > 0 ? lineMatchRows! : null,
    grnReceivedValue,
  };
}
