import type { IntegrationAdapter } from "./types";

/**
 * MCA21 V3 adapter — files ROC e-Forms (DIR-3 KYC, MSME-1, DPT-3, AOC-4, MGT-7,
 * etc.) to the Ministry of Corporate Affairs MCA21 V3 portal via a GSP/practitioner
 * gateway and captures the SRN (Service Request Number) on acceptance.
 *
 * Why a gateway façade instead of scripting the MCA21 V3 portal directly:
 *   - MCA21 V3 (mca.gov.in) authenticates with a portal user + DSC (Digital
 *     Signature Certificate) and is a session/OTP-gated web app with no
 *     first-party bulk REST API. Companies file through an authorised gateway
 *     (practitioner/GSP) that accepts a prepared e-Form payload, applies the
 *     DSC, submits it, and returns the SRN + challan for the statutory fee.
 *   - The e-Form body (form code + the form-specific field map) is the canonical
 *     payload; it is built upstream by the filing router. The adapter is
 *     transport-only: it posts the prepared body and normalises the SRN back.
 */

interface Mca21Config {
  /** Gateway-issued API key. */
  apiKey: string;
  /** Corporate Identity Number the filings are raised under. */
  cin: string;
  /** MCA21 portal user id provisioned for gateway access. */
  portalUser: string;
  /** Gateway base URL; defaults to the sandbox. */
  baseUrl?: string;
  environment?: "sandbox" | "production";
}

export interface Mca21Filing {
  /** ROC e-Form code, e.g. "DIR-3-KYC", "MSME-1", "DPT-3", "AOC-4". */
  formCode: string;
  /** Financial year / period the form covers (form-dependent). */
  period?: string;
  /** Form-specific field map — the prepared e-Form body. */
  formData: Record<string, unknown>;
}

interface Mca21Response {
  srn?: string;
  challanRef?: string;
  status?: string;
  error?: string;
}

const SANDBOX_BASE = "https://gateway-sandbox.mca21-suvidha.in";
const PROD_BASE = "https://gateway.mca21-suvidha.in";

/** MCA CIN: L/U + 5-digit industry + 2-char state + 4-digit year + 3-char type + 6-digit reg no. */
const CIN_RE = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

export const mca21Adapter: IntegrationAdapter<Mca21Config, Mca21Filing> = {
  provider: "mca21",
  displayName: "MCA21 V3 (Gateway)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.cin || !config.portalUser) {
      return { ok: false, details: "Missing apiKey, cin or portalUser" };
    }
    if (!CIN_RE.test(config.cin)) {
      return { ok: false, details: "CIN format invalid" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, filing) {
    const base = config.baseUrl ?? (config.environment === "production" ? PROD_BASE : SANDBOX_BASE);
    const res = await fetch(`${base}/v1/eform/file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "x-cin": config.cin,
        "x-portal-user": config.portalUser,
      },
      body: JSON.stringify({
        cin: config.cin,
        formCode: filing.formCode,
        period: filing.period,
        formData: filing.formData,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MCA21 filing failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as Mca21Response;
    if (json.error || !json.srn) {
      throw new Error(`MCA21 filing rejected: ${json.error ?? "no SRN returned"}`);
    }
    return { providerRef: json.srn, raw: json };
  },
};
