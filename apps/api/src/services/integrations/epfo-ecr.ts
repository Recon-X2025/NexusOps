import type { IntegrationAdapter } from "./types";

/**
 * EPFO ECR adapter — Electronic Challan-cum-Return upload to the EPFO Unified
 * Portal via a GSP (GST/EPFO Suvidha Provider) façade.
 *
 * Why a GSP façade instead of scripting the Unified Portal directly:
 *   - The EPFO Unified Portal (unifiedportal-emp.epfindia.gov.in) is a
 *     session/CAPTCHA-gated web app with no first-party REST API. Employers
 *     integrate through an authorised GSP that exposes a clean upload endpoint
 *     and returns the TRRN (Temporary Return Reference Number) on acceptance.
 *   - The ECR text file (`#~#`-delimited, one member line per employee) is the
 *     canonical payload; the GSP validates + forwards it and hands back a TRRN
 *     plus a challan reference which we persist on the submission row.
 *
 * The adapter is transport-only: the ECR line body is built upstream (the
 * `generateECR` helper already produces the `#~#` member lines) and passed in
 * as `ecrBody`. The adapter posts it and normalises the TRRN/challan back.
 */

interface EpfoConfig {
  /** GSP-issued API key. */
  apiKey: string;
  /** Establishment code registered with EPFO (the employer's PF code). */
  establishmentId: string;
  /** GSP base URL; defaults to the sandbox. */
  baseUrl?: string;
  environment?: "sandbox" | "production";
}

export interface EcrUpload {
  /** Wage month in MM-YYYY the return covers. */
  wageMonth: string;
  /** The canonical `#~#`-delimited ECR member lines. */
  ecrBody: string;
  totalEpf: number;
  totalEps: number;
  totalEmployee: number;
  totalEmployer: number;
}

interface EcrPortalResponse {
  trrn?: string;
  challanReference?: string;
  status?: string;
  message?: string;
}

const SANDBOX_BASE = "https://gsp-sandbox.epfo-suvidha.in";
const PROD_BASE = "https://gsp.epfo-suvidha.in";

export const epfoEcrAdapter: IntegrationAdapter<EpfoConfig, EcrUpload> = {
  provider: "epfo_ecr",
  displayName: "EPFO ECR (GSP)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.apiKey || !config.establishmentId) {
      return { ok: false, details: "Missing apiKey or establishmentId" };
    }
    // EPFO establishment codes are of the form XX/XXX/1234567/000.
    if (!/^[A-Z]{2}\/[A-Z0-9]{3}\/\d{7}\/\d{3}$/.test(config.establishmentId)) {
      return { ok: false, details: "Establishment code format invalid" };
    }
    return { ok: true, details: "Credentials present; ping deferred" };
  },

  async send(config, upload) {
    const base = config.baseUrl ?? (config.environment === "production" ? PROD_BASE : SANDBOX_BASE);
    const res = await fetch(`${base}/v1/ecr/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        establishmentId: config.establishmentId,
        wageMonth: upload.wageMonth,
        ecr: upload.ecrBody,
        totals: {
          epf: upload.totalEpf,
          eps: upload.totalEps,
          employee: upload.totalEmployee,
          employer: upload.totalEmployer,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EPFO ECR upload failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as EcrPortalResponse;
    if (!json.trrn) {
      throw new Error(`EPFO ECR upload rejected: ${json.message ?? "no TRRN returned"}`);
    }
    return { providerRef: json.trrn, raw: json };
  },
};
