import type { IntegrationAdapter } from "./types";

/**
 * ClearTax GST adapter — IRN generation + GSTR-1 push.
 *
 * Why ClearTax wrapper instead of direct GSP for v1:
 *   - GSP onboarding (NSDL/EY) takes 3-6 months legal + tech
 *   - ClearTax is already an authorised GSP and exposes a clean REST API
 *   - We can swap to direct GSP post-GA without changing call-sites
 *
 * Production-readiness note: ClearTax sandbox auth uses an API key + secret
 * obtained from clear.gst.gov.in admin. Live keys are issued only after a
 * compliance review of the calling tenant's GSTIN.
 */

interface ClearTaxConfig {
  apiKey: string;
  apiSecret: string;
  gstin: string;
  environment?: "sandbox" | "production";
}

export interface IrnRequest {
  invoiceNumber: string;
  invoiceDate: string; // dd/mm/yyyy
  invoiceType: "INV" | "CRN" | "DBN";
  supplyType: "B2B" | "B2C" | "EXP" | "SEZ";
  buyerGstin?: string;
  buyerName: string;
  buyerStateCode: string; // 2-digit
  totalAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineItems: Array<{
    description: string;
    hsnCode: string;
    quantity: number;
    unitPrice: number;
    taxableValue: number;
    gstRate: number;
  }>;
}

interface IrnResponse {
  irn: string;
  ackNumber: string;
  ackDate: string;
  signedQrCode: string;
  signedInvoice?: string;
}

const SANDBOX_BASE = "https://einv-apisandbox.cleartax.in";
const PROD_BASE = "https://einv-api.cleartax.in";

export const clearTaxGstAdapter: IntegrationAdapter<ClearTaxConfig, IrnRequest> = {
  provider: "cleartax_gst",
  displayName: "ClearTax GST",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.apiSecret || !config.gstin) {
      return { ok: false, details: "Missing apiKey, apiSecret, or gstin" };
    }
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(config.gstin)) {
      return { ok: false, details: "GSTIN format invalid" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, invoice) {
    const base = config.environment === "production" ? PROD_BASE : SANDBOX_BASE;
    const res = await fetch(`${base}/v2/einvoice/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "x-api-secret": config.apiSecret,
        gstin: config.gstin,
      },
      body: JSON.stringify({
        Version: "1.1",
        TranDtls: {
          TaxSch: "GST",
          SupTyp: invoice.supplyType,
          IgstOnIntra: "N",
        },
        DocDtls: {
          Typ: invoice.invoiceType,
          No: invoice.invoiceNumber,
          Dt: invoice.invoiceDate,
        },
        SellerDtls: { Gstin: config.gstin },
        BuyerDtls: {
          Gstin: invoice.buyerGstin ?? "URP",
          LglNm: invoice.buyerName,
          Pos: invoice.buyerStateCode,
          Stcd: invoice.buyerStateCode,
        },
        ItemList: invoice.lineItems.map((it, idx) => ({
          SlNo: String(idx + 1),
          PrdDesc: it.description,
          HsnCd: it.hsnCode,
          Qty: it.quantity,
          Unit: "NOS",
          UnitPrice: it.unitPrice,
          TotAmt: it.quantity * it.unitPrice,
          AssAmt: it.taxableValue,
          GstRt: it.gstRate,
        })),
        ValDtls: {
          AssVal: invoice.taxableAmount,
          CgstVal: invoice.cgst,
          SgstVal: invoice.sgst,
          IgstVal: invoice.igst,
          TotInvVal: invoice.totalAmount,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ClearTax IRN failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { Data: IrnResponse };
    return { providerRef: json.Data.irn, raw: json.Data };
  },
};
