import type { IntegrationAdapter } from "./types";

/**
 * ESIC return adapter — monthly ESI contribution (MC) return upload to the ESIC
 * portal (esic.gov.in / esic.in) via an authorised GSP façade.
 *
 * Why a GSP façade instead of scripting the ESIC portal directly:
 *   - The ESIC employer portal is a session/CAPTCHA-gated web app with no
 *     first-party REST API. Employers file the monthly contribution through the
 *     portal (or an authorised intermediary) and receive a challan number once
 *     the contribution is accepted for payment.
 *   - The MC return is a per-IP (Insured Person) line list plus the aggregated
 *     employee/employer contribution split. This adapter is transport-only: the
 *     line list is built upstream and passed in as `mcLines`; the adapter posts
 *     it and normalises the challan number back onto the submission row.
 */

interface EsicConfig {
  /** GSP-issued API key. */
  apiKey: string;
  /** 17-digit ESIC employer code registered with ESIC. */
  employerCode: string;
  /** GSP base URL; defaults to the sandbox. */
  baseUrl?: string;
  environment?: "sandbox" | "production";
}

export interface EsiReturnUpload {
  /** Contribution month in MM-YYYY the return covers. */
  contributionMonth: string;
  /** The canonical MC (monthly-contribution) member lines, one per IP. */
  mcLines: string;
  totalEmployees: number;
  totalEmployeeContribution: number;
  totalEmployerContribution: number;
}

interface EsicPortalResponse {
  challanNumber?: string;
  status?: string;
  message?: string;
}

const SANDBOX_BASE = "https://gsp-sandbox.esic-suvidha.in";
const PROD_BASE = "https://gsp.esic-suvidha.in";

export const esicReturnAdapter: IntegrationAdapter<EsicConfig, EsiReturnUpload> = {
  provider: "esic_return",
  displayName: "ESIC Return (GSP)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.employerCode) {
      return { ok: false, details: "Missing apiKey or employerCode" };
    }
    // ESIC employer codes are 17-digit numeric strings.
    if (!/^\d{17}$/.test(config.employerCode)) {
      return { ok: false, details: "Employer code must be 17 digits" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, upload) {
    const base = config.baseUrl ?? (config.environment === "production" ? PROD_BASE : SANDBOX_BASE);
    const res = await fetch(`${base}/v1/mc/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        employerCode: config.employerCode,
        contributionMonth: upload.contributionMonth,
        mc: upload.mcLines,
        totals: {
          employees: upload.totalEmployees,
          employee: upload.totalEmployeeContribution,
          employer: upload.totalEmployerContribution,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ESIC return upload failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as EsicPortalResponse;
    if (!json.challanNumber) {
      throw new Error(`ESIC return rejected: ${json.message ?? "no challan number returned"}`);
    }
    return { providerRef: json.challanNumber, raw: json };
  },
};
