import type { IntegrationAdapter } from "./types";

/**
 * NIC E-Way Bill adapter — generates and cancels E-Way Bills against the
 * National Informatics Centre (NIC) E-Way Bill system via a GSP façade.
 *
 * Why a GSP façade instead of the NIC portal directly:
 *   - The NIC E-Way Bill portal (ewaybillgst.gov.in) authenticates with a
 *     session token minted from a GSP-issued API credential + the taxpayer's
 *     GSTIN. Employers/suppliers integrate through an authorised GSP that
 *     exposes a stable REST surface (generate / cancel / get) and returns the
 *     EWB number + validity window on acceptance.
 *   - The request body is the canonical NIC EWB-01 shape (built upstream by the
 *     router from the tax invoice); the adapter is transport-only — it posts the
 *     prepared payload and normalises the ack (ewbNo, validUpto) back.
 *
 * `send` is a two-op discriminated union so a single adapter method covers both
 * the generate and cancel round-trips while satisfying IntegrationAdapter.
 */

interface NicEwayBillConfig {
  /** GSP-issued API key / client id. */
  apiKey: string;
  /** Supplier GSTIN the EWB is raised under. */
  gstin: string;
  /** NIC-portal user id provisioned for API access. */
  username: string;
  /** GSP base URL; defaults to the sandbox. */
  baseUrl?: string;
  environment?: "sandbox" | "production";
}

/** One consignment line as NIC expects it (itemList entry). */
export interface EwayBillItem {
  productName: string;
  hsnCode: string;
  quantity: number;
  taxableAmount: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
}

export interface EwayBillGenerate {
  op: "generate";
  invoiceNumber: string;
  invoiceDate: string; // DD/MM/YYYY per NIC
  supplyType: "O" | "I"; // Outward / Inward
  subSupplyType: string; // 1 = Supply, ...
  docType: "INV" | "BIL" | "BOE" | "CHL" | "OTH";
  fromGstin: string;
  toGstin: string;
  fromStateCode: number;
  toStateCode: number;
  transDistance: number;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  itemList: EwayBillItem[];
}

export interface EwayBillCancel {
  op: "cancel";
  ewbNo: string;
  /** NIC cancel reason code: 1 = Duplicate, 2 = Order Cancelled, 3 = Data Entry Mistake, 4 = Others. */
  cancelRsnCode: 1 | 2 | 3 | 4;
  cancelRemark: string;
}

export type EwayBillMessage = EwayBillGenerate | EwayBillCancel;

interface NicGenerateResponse {
  ewayBillNo?: number | string;
  ewayBillDate?: string;
  validUpto?: string;
  status?: string;
  error?: string;
}

interface NicCancelResponse {
  ewayBillNo?: number | string;
  cancelDate?: string;
  status?: string;
  error?: string;
}

const SANDBOX_BASE = "https://gsp-sandbox.nic-ewaybill.in";
const PROD_BASE = "https://gsp.nic-ewaybill.in";

/** NIC returns validity as "DD/MM/YYYY hh:mm:ss AM/PM" — parse to a Date or null. */
export function parseNicValidUpto(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, dd, mm, yyyy, hhStr, min, ss, mer] = m;
  let hh = Number(hhStr);
  if (mer) {
    const upper = mer.toUpperCase();
    if (upper === "PM" && hh < 12) hh += 12;
    if (upper === "AM" && hh === 12) hh = 0;
  }
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    hh,
    Number(min),
    Number(ss),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export const nicEwayBillAdapter: IntegrationAdapter<NicEwayBillConfig, EwayBillMessage> = {
  provider: "nic_ewaybill",
  displayName: "NIC E-Way Bill (GSP)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.gstin || !config.username) {
      return { ok: false, details: "Missing apiKey, gstin or username" };
    }
    // GSTIN: 2-digit state code + 10-char PAN + entity + Z + checksum.
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(config.gstin)) {
      return { ok: false, details: "GSTIN format invalid" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, message) {
    const base = config.baseUrl ?? (config.environment === "production" ? PROD_BASE : SANDBOX_BASE);
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "x-gstin": config.gstin,
      "x-username": config.username,
    };

    if (message.op === "cancel") {
      const res = await fetch(`${base}/v1/ewaybill/cancel`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ewbNo: message.ewbNo,
          cancelRsnCode: message.cancelRsnCode,
          cancelRmrk: message.cancelRemark,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`NIC E-Way Bill cancel failed: ${res.status} ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as NicCancelResponse;
      if (json.error) {
        throw new Error(`NIC E-Way Bill cancel rejected: ${json.error}`);
      }
      return { providerRef: String(json.ewayBillNo ?? message.ewbNo), raw: json };
    }

    // generate
    const res = await fetch(`${base}/v1/ewaybill/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        supplyType: message.supplyType,
        subSupplyType: message.subSupplyType,
        docType: message.docType,
        docNo: message.invoiceNumber,
        docDate: message.invoiceDate,
        fromGstin: message.fromGstin,
        toGstin: message.toGstin,
        fromStateCode: message.fromStateCode,
        toStateCode: message.toStateCode,
        transDistance: message.transDistance,
        totInvValue: message.totalValue,
        cgstValue: message.cgstValue,
        sgstValue: message.sgstValue,
        igstValue: message.igstValue,
        itemList: message.itemList.map((it) => ({
          productName: it.productName,
          hsnCode: it.hsnCode,
          quantity: it.quantity,
          taxableAmount: it.taxableAmount,
          cgstRate: it.cgstRate ?? 0,
          sgstRate: it.sgstRate ?? 0,
          igstRate: it.igstRate ?? 0,
        })),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NIC E-Way Bill generate failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as NicGenerateResponse;
    if (json.error || !json.ewayBillNo) {
      throw new Error(`NIC E-Way Bill generate rejected: ${json.error ?? "no EWB number returned"}`);
    }
    return { providerRef: String(json.ewayBillNo), raw: json };
  },
};
