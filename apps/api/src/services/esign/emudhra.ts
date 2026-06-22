import crypto from "node:crypto";
import { verifyHmac } from "../encryption";
import type { EsignProvider } from "./types";

/**
 * eMudhra ASP — IT Act §3A compliant e-sign via:
 *   - Aadhaar e-Sign (OTP/biometric on UIDAI infra)
 *   - DSC sign (for company-affixed documents)
 *
 * Sandbox: https://emsigner.emudhra.com (per ASP onboarding).
 * Tenant credentials (apiKey, apiSecret, signerId) stored encrypted in
 * `integrations.configEncrypted`.
 *
 * The two flows we ship:
 *   1. init() — POST envelope, returns signer URLs (Aadhaar OTP page).
 *   2. verifyCallback() — eMudhra POSTs back to /api/webhooks/esign/emudhra
 *      with HMAC-signed body containing envelope status.
 */

interface EmudhraConfig {
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  signerId?: string;
  environment?: "sandbox" | "production";
}

const SANDBOX_BASE = "https://emsigner-sandbox.emudhra.com/api/v3";
const PROD_BASE = "https://emsigner.emudhra.com/api/v3";

function authHeader(c: EmudhraConfig): string {
  // eMudhra uses HMAC-SHA256 over (apiKey + timestamp) signed with apiSecret.
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac("sha256", c.apiSecret)
    .update(`${c.apiKey}${ts}`)
    .digest("hex");
  return `Bearer ${c.apiKey}:${ts}:${sig}`;
}

function base(c: EmudhraConfig): string {
  return c.environment === "production" ? PROD_BASE : SANDBOX_BASE;
}

export const emudhraProvider: EsignProvider<EmudhraConfig> = {
  provider: "emudhra",
  displayName: "eMudhra (Aadhaar e-Sign / DSC)",

  async init(config, req) {
    const res = await fetch(`${base(config)}/envelopes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(config),
      },
      body: JSON.stringify({
        documentName: req.title,
        documentContent: req.documentBase64,
        documentChecksum: req.documentSha256,
        message: req.message ?? "",
        signers: req.signers.map((s, i) => ({
          name: s.name,
          email: s.email,
          phone: s.phone,
          role: s.role ?? "signer",
          order: s.routingOrder ?? i + 1,
          signMethod: "AADHAAR_OTP",
        })),
        expiryDate: req.expiresAt?.toISOString(),
        callbackUrl: req.callbackUrl,
        metadata: req.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eMudhra init failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      envelopeId: string;
      signers: Array<{ email: string; signingUrl: string }>;
    };
    return {
      envelopeId: json.envelopeId,
      signingUrls: json.signers.map((s) => ({ email: s.email, url: s.signingUrl })),
    };
  },

  async getStatus(config, envelopeId) {
    const res = await fetch(`${base(config)}/envelopes/${envelopeId}`, {
      headers: { Authorization: authHeader(config) },
    });
    if (!res.ok) throw new Error(`eMudhra status failed: ${res.status}`);
    const json = (await res.json()) as {
      envelopeId: string;
      status: string;
      signers: Array<{
        email: string;
        status: string;
        signedAt?: string;
        aadhaarHash?: string;
        certHash?: string;
      }>;
    };
    type EnvelopeStatus =
      | "sent"
      | "viewed"
      | "signed"
      | "declined"
      | "expired"
      | "voided"
      | "completed";
    return {
      envelopeId: json.envelopeId,
      status: json.status as EnvelopeStatus,
      signers: json.signers.map((s) => {
        const out: {
          email: string;
          status: "pending" | "viewed" | "signed" | "declined";
          signedAt?: Date;
          aadhaarMaskedHash?: string;
          certificateHash?: string;
        } = {
          email: s.email,
          status: s.status as "pending" | "viewed" | "signed" | "declined",
        };
        if (s.signedAt) out.signedAt = new Date(s.signedAt);
        if (s.aadhaarHash) out.aadhaarMaskedHash = s.aadhaarHash;
        if (s.certHash) out.certificateHash = s.certHash;
        return out;
      }),
    };
  },

  async fetchSignedDocument(config, envelopeId) {
    const res = await fetch(`${base(config)}/envelopes/${envelopeId}/document`, {
      headers: { Authorization: authHeader(config) },
    });
    if (!res.ok) throw new Error(`eMudhra fetch signed doc failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    return { bytes: buf, sha256 };
  },

  async verifyCallback(config, body, headers) {
    const sig = headers["x-emudhra-signature"] ?? "";
    if (!sig || !verifyHmac(config.webhookSecret, body, sig)) {
      throw new Error("Invalid eMudhra callback signature");
    }
    const parsed = JSON.parse(body) as { envelopeId: string; status: string };
    return {
      envelopeId: parsed.envelopeId,
      status: parsed.status as "sent" | "viewed" | "signed" | "declined" | "expired" | "voided" | "completed",
    };
  },
};
