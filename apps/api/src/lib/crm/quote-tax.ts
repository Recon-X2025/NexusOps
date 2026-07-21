/**
 * Quote GST computation (G7).
 * ───────────────────────────
 * Before G7, `crm_quotes` carried only subtotal/discountPct/total — no tax at
 * all (`total = subtotal − discount`). A CPQ quote for an Indian buyer must
 * carry GST or it can't become a tax invoice. This module computes the CGST/
 * SGST/IGST split for a quote and rolls it up into header tax columns.
 *
 * Rules (mirroring the AP/AR invoice engine in routers/financial.ts):
 *   - Discount applies BEFORE tax: taxableValue = subtotal × (1 − discountPct/100).
 *   - Per-line GST: each line's discounted share is taxed at its own `gstRate`
 *     (falls back to the org/default rate). This lets a quote mix 5%/12%/18%
 *     lines and still roll up correctly.
 *   - Intra-state (supplier state == buyer state, or buyer unknown) → CGST+SGST;
 *     inter-state → IGST. Total tax is identical either way; only the split
 *     differs. Unknown buyer state is treated as intra-state (safe default).
 *   - total = taxableValue + taxTotal.
 */
import {
  gstinRegistry,
  crmDeals,
  crmAccounts,
  eq,
  and,
  desc,
  type DbOrTx,
} from "@coheronconnect/db";
import { computeGST, type GSTRate } from "../india/gst-engine";

/** GST rates the engine accepts. */
const VALID_GST_RATES: readonly number[] = [0, 5, 12, 18, 28];
const DEFAULT_GST_RATE: GSTRate = 18;

function coerceGstRate(rate: number | undefined, fallback: GSTRate): GSTRate {
  if (rate === undefined) return fallback;
  return (VALID_GST_RATES.includes(rate) ? rate : fallback) as GSTRate;
}

export interface QuoteLine {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  hsnCode?: string;
  gstRate?: number;
}

export interface QuoteTaxColumns {
  subtotal: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxTotal: string;
  total: string;
  isInterstate: boolean;
  placeOfSupply: string | null;
}

/** Supplier (org) place-of-supply state from the primary active GSTIN. */
export async function resolveOrgState(db: DbOrTx, orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ stateCode: gstinRegistry.stateCode, stateName: gstinRegistry.stateName })
    .from(gstinRegistry)
    .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.isActive, true)))
    .orderBy(desc(gstinRegistry.isPrimary), gstinRegistry.createdAt)
    .limit(1);
  return row?.stateCode ?? row?.stateName ?? null;
}

/**
 * Buyer state for a quote: the linked deal's account `stateCode`. Returns null
 * when there's no deal or the account has no state (→ intra-state default).
 */
export async function resolveQuoteBuyerState(
  db: DbOrTx,
  orgId: string,
  dealId: string | null | undefined,
): Promise<string | null> {
  if (!dealId) return null;
  const [row] = await db
    .select({ stateCode: crmAccounts.stateCode })
    .from(crmDeals)
    .innerJoin(crmAccounts, eq(crmDeals.accountId, crmAccounts.id))
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.orgId, orgId)))
    .limit(1);
  return row?.stateCode ?? null;
}

/**
 * Compute the full set of tax columns for a quote. Pure given resolved states —
 * takes the line items, discount %, and both party states, returns numeric
 * strings ready to spread into a `crmQuotes` insert/update.
 */
export function computeQuoteTax(params: {
  items: QuoteLine[];
  discountPct: string;
  orgState: string | null;
  buyerState: string | null;
  defaultGstRate?: GSTRate;
}): QuoteTaxColumns {
  const { items, orgState, buyerState } = params;
  const defaultRate = params.defaultGstRate ?? DEFAULT_GST_RATE;

  const subtotal = round2(items.reduce((acc, i) => acc + Number(i.total || 0), 0));
  const discountPct = clampPct(Number(params.discountPct || 0));
  const discountFactor = 1 - discountPct / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let taxableTotal = 0;
  let interstate = false;

  for (const item of items) {
    const lineGross = Number(item.total || 0);
    if (lineGross <= 0) continue;
    const lineTaxable = round2(lineGross * discountFactor);
    const rate = coerceGstRate(item.gstRate, defaultRate);
    const gst = computeGST({
      taxableValue: lineTaxable,
      gstRate: rate,
      supplierState: orgState ?? "",
      buyerState: buyerState ?? orgState ?? "",
    });
    cgst += gst.cgstAmount;
    sgst += gst.sgstAmount;
    igst += gst.igstAmount;
    taxableTotal += lineTaxable;
    interstate = gst.isInterstate;
  }

  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  const taxTotal = round2(cgst + sgst + igst);
  const taxableValue = round2(taxableTotal);
  const total = round2(taxableValue + taxTotal);

  return {
    subtotal: String(subtotal),
    taxableValue: String(taxableValue),
    cgstAmount: String(cgst),
    sgstAmount: String(sgst),
    igstAmount: String(igst),
    taxTotal: String(taxTotal),
    total: String(total),
    isInterstate: interstate,
    placeOfSupply: buyerState ?? orgState ?? null,
  };
}

/**
 * Resolve states + compute tax in one call — the common path for the quote
 * create/update procedures.
 */
export async function buildQuoteTaxColumns(
  db: DbOrTx,
  params: {
    orgId: string;
    dealId: string | null | undefined;
    items: QuoteLine[];
    discountPct: string;
    defaultGstRate?: GSTRate;
  },
): Promise<QuoteTaxColumns> {
  const [orgState, buyerState] = await Promise.all([
    resolveOrgState(db, params.orgId),
    resolveQuoteBuyerState(db, params.orgId, params.dealId),
  ]);
  return computeQuoteTax({
    items: params.items,
    discountPct: params.discountPct,
    orgState,
    buyerState,
    defaultGstRate: params.defaultGstRate,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
