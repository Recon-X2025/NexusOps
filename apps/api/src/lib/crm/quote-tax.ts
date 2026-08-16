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
import { TRPCError } from "@trpc/server";
import { GSTIN_STATE_CODES } from "@coheronconnect/payroll-math";
import { computeGST, normaliseGstStateOrWarn, type GSTRate } from "../india/gst-engine";

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
  /** Line gross, already net of this line's own `discountPct`. */
  total: string;
  hsnCode?: string;
  gstRate?: number;
  /** Per-line discount, folded into `total`; stored so the quote can show it. */
  discountPct?: number;
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

/** Human-readable name for a resolved 2-digit GST state code. */
export function gstStateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return GSTIN_STATE_CODES[code] ?? null;
}

/**
 * Who the quote is billed to, and what state they are in.
 *
 * `resolveQuoteBuyerState` returned only the raw state, so the caller could not
 * tell "this account is in Karnataka" from "this quote has no account at all" —
 * both arrived as a bare string-or-null and both silently became intra-state.
 * The editor has to show the difference, so the context comes back whole.
 */
export interface QuoteBuyerContext {
  /** True when the quote is linked to a deal that is linked to an account. */
  hasAccount: boolean;
  accountId: string | null;
  accountName: string | null;
  /** Exactly as stored on `crm_accounts.state_code` — may be a name, may be a code. */
  rawState: string | null;
}

export async function resolveQuoteBuyerContext(
  db: DbOrTx,
  orgId: string,
  dealId: string | null | undefined,
): Promise<QuoteBuyerContext> {
  const empty: QuoteBuyerContext = { hasAccount: false, accountId: null, accountName: null, rawState: null };
  if (!dealId) return empty;
  const [row] = await db
    .select({ accountId: crmAccounts.id, accountName: crmAccounts.name, stateCode: crmAccounts.stateCode })
    .from(crmDeals)
    .innerJoin(crmAccounts, eq(crmDeals.accountId, crmAccounts.id))
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.orgId, orgId)))
    .limit(1);
  if (!row) return empty;
  return { hasAccount: true, accountId: row.accountId, accountName: row.accountName, rawState: row.stateCode ?? null };
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
  return (await resolveQuoteBuyerContext(db, orgId, dealId)).rawState;
}

/**
 * A quote with no lines, or lines that total zero, is not a quote — it is an
 * empty document that reads as priced. The New Quote dialog used to send one
 * hardcoded line worth zero, so every quote the UI produced totalled ₹0 and
 * carried ₹0 of tax while looking complete. Rejecting in the dialog alone would
 * leave the API able to mint them, so the rule lives here and both the canonical
 * and the deprecated create path call it.
 */
export function assertQuoteHasValue(items: QuoteLine[]): void {
  if (!items || items.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A quote needs at least one line item." });
  }
  const gross = items.reduce((acc, i) => acc + Number(i.total || 0), 0);
  if (!(gross > 0)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A quote must total more than zero — give each line a quantity and a unit price.",
    });
  }
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

/** What `buildQuoteTaxColumns` resolved, so a caller can explain the split it got. */
export interface QuoteTaxResolution extends QuoteTaxColumns {
  /** Supplier state as a 2-digit code, or null when the org has no active GSTIN. */
  orgStateCode: string | null;
  orgStateName: string | null;
  /** Buyer state as a 2-digit code, or null when unknown (→ treated as intra-state). */
  buyerStateCode: string | null;
  buyerStateName: string | null;
  buyer: QuoteBuyerContext;
}

/**
 * Resolve states + compute tax in one call — the common path for the quote
 * create/update procedures.
 *
 * Both sides are reduced to a 2-digit GST code FIRST. `computeGST` decides
 * intra-vs-inter by a raw case-insensitive string compare, and this path used to
 * hand it whatever was stored: the org side arrives from `gstin_registry` as a
 * code ("29") while `crm_accounts.state_code` is free text that may hold a NAME
 * ("Karnataka"). "29" ≠ "karnataka", so a local sale was billed as inter-state
 * IGST — the right total, the wrong split, on a document that looks correct.
 * `normaliseGstStateOrWarn` also LOGS a present-but-unrecognised state; an
 * absent one stays a silent, legitimate unknown (see `hasAccount`/`rawState` on
 * the returned buyer context, which is how the editor can say so out loud).
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
): Promise<QuoteTaxResolution> {
  const [rawOrgState, buyer] = await Promise.all([
    resolveOrgState(db, params.orgId),
    resolveQuoteBuyerContext(db, params.orgId, params.dealId),
  ]);
  const orgStateCode = normaliseGstStateOrWarn(rawOrgState, "org");
  const buyerStateCode = normaliseGstStateOrWarn(buyer.rawState, "crm_account");

  const columns = computeQuoteTax({
    items: params.items,
    discountPct: params.discountPct,
    orgState: orgStateCode,
    buyerState: buyerStateCode,
    defaultGstRate: params.defaultGstRate,
  });

  return {
    ...columns,
    orgStateCode,
    orgStateName: gstStateName(orgStateCode),
    buyerStateCode,
    buyerStateName: gstStateName(buyerStateCode),
    buyer,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
