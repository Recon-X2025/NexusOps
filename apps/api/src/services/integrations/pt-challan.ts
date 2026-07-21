import type { IntegrationAdapter } from "./types";

/**
 * Professional-tax (PT) challan adapter — pushes a state PT challan to the
 * relevant state commercial-tax / PT portal via an authorised GSP façade.
 *
 * Why a GSP façade instead of scripting each state portal directly:
 *   - PT is a state levy; each state (Maharashtra MahaGST, Karnataka e-PRERANA,
 *     West Bengal, etc.) runs its own session/CAPTCHA-gated portal with no
 *     uniform first-party REST API. A GSP normalises the per-state upload behind
 *     one endpoint and returns the state-issued challan number on acceptance.
 *   - The challan is a per-employee PT line list plus the aggregated PT withheld.
 *     This adapter is transport-only: the line list is built upstream and passed
 *     in as `ptLines`; the adapter posts it and normalises the challan number
 *     back onto the submission row. `stateCode` selects the destination portal.
 */

interface PtChallanConfig {
  /** GSP-issued API key. */
  apiKey: string;
  /** Employer PT registration number (state-issued). */
  ptRegistrationNumber: string;
  /** GSP base URL; defaults to the sandbox. */
  baseUrl?: string;
  environment?: "sandbox" | "production";
}

export interface PtChallanUpload {
  /** State the challan is filed in (e.g. MAHARASHTRA). Selects the portal. */
  stateCode: string;
  /** Period the challan covers in MM-YYYY. */
  period: string;
  /** The canonical per-employee PT line list. */
  ptLines: string;
  totalEmployees: number;
  totalPtDeducted: number;
}

interface PtChallanPortalResponse {
  challanNumber?: string;
  status?: string;
  message?: string;
}

const SANDBOX_BASE = "https://gsp-sandbox.pt-suvidha.in";
const PROD_BASE = "https://gsp.pt-suvidha.in";

export const ptChallanAdapter: IntegrationAdapter<PtChallanConfig, PtChallanUpload> = {
  provider: "pt_challan",
  displayName: "Professional Tax Challan (GSP)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.ptRegistrationNumber) {
      return { ok: false, details: "Missing apiKey or ptRegistrationNumber" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, upload) {
    const base = config.baseUrl ?? (config.environment === "production" ? PROD_BASE : SANDBOX_BASE);
    const res = await fetch(`${base}/v1/pt/challan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        ptRegistrationNumber: config.ptRegistrationNumber,
        stateCode: upload.stateCode,
        period: upload.period,
        lines: upload.ptLines,
        totals: {
          employees: upload.totalEmployees,
          pt: upload.totalPtDeducted,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PT challan upload failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as PtChallanPortalResponse;
    if (!json.challanNumber) {
      throw new Error(`PT challan rejected: ${json.message ?? "no challan number returned"}`);
    }
    return { providerRef: json.challanNumber, raw: json };
  },
};
