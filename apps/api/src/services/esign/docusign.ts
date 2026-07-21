import crypto from "node:crypto";
import type { EsignProvider, EsignStatus } from "./types";

/**
 * DocuSign eSignature adapter — IT Act §3A / ESIGN Act / eIDAS compliant
 * electronic signature for cross-border contracts, offer letters and NDAs where
 * an Aadhaar-bound signature is not required.
 *
 * Auth: DocuSign REST v2.1 authenticates with an OAuth2 bearer access token. We
 * take a long-lived integration-issued `accessToken` in the tenant config (the
 * caller provisions/refreshes it out-of-band via JWT-grant or auth-code); the
 * adapter is transport-only and never mints tokens itself. `accountId` scopes
 * every REST path; `basePath` is the account's assigned base URI
 * (e.g. https://demo.docusign.net for the sandbox, https://na3.docusign.net etc.
 * for production — DocuSign assigns it per account, so it is configured, not
 * derived).
 *
 * Envelope model → our model:
 *   - init()      → POST /envelopes with an embedded document + signers, then a
 *                   recipient-view POST per signer to mint the signing URL.
 *   - getStatus() → GET /envelopes/{id}?include=recipients, mapping DocuSign
 *                   envelope + recipient statuses onto our unions.
 *   - fetchSignedDocument() → GET /envelopes/{id}/documents/combined (the signed
 *                   PDF), hashed to sha256.
 *   - verifyCallback() → DocuSign Connect posts a JSON body signed with an
 *                   HMAC-SHA256 key; the signature arrives base64 in
 *                   `x-docusign-signature-1`. We verify against config.hmacKey.
 */

interface DocusignConfig {
  /** OAuth2 bearer access token (provisioned/refreshed out-of-band). */
  accessToken: string;
  /** DocuSign API account GUID. */
  accountId: string;
  /** Account base URI, e.g. https://demo.docusign.net (sandbox). */
  basePath: string;
  /** DocuSign Connect HMAC key for webhook signature verification. */
  hmacKey: string;
  environment?: "sandbox" | "production";
}

/** DocuSign REST paths are versioned under /restapi/v2.1. */
function apiBase(c: DocusignConfig): string {
  const root = c.basePath.replace(/\/+$/, "");
  return `${root}/restapi/v2.1/accounts/${c.accountId}`;
}

function authHeaders(c: DocusignConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${c.accessToken}`,
  };
}

/**
 * DocuSign envelope status → our EsignStatus["status"].
 * DocuSign values: created, sent, delivered, signed, completed, declined,
 * voided, deleted. (`delivered` == recipient viewed the envelope.)
 */
function mapEnvelopeStatus(s: string): EsignStatus["status"] {
  switch (s) {
    case "created":
    case "sent":
      return "sent";
    case "delivered":
      return "viewed";
    case "signed":
      return "signed";
    case "completed":
      return "completed";
    case "declined":
      return "declined";
    case "voided":
    case "deleted":
      return "voided";
    default:
      return "sent";
  }
}

/** DocuSign recipient status → our per-signer status union. */
function mapRecipientStatus(s: string): "pending" | "viewed" | "signed" | "declined" {
  switch (s) {
    case "delivered":
    case "autoresponded":
      return "viewed";
    case "signed":
    case "completed":
      return "signed";
    case "declined":
      return "declined";
    default:
      return "pending";
  }
}

interface DsEnvelopeResponse {
  envelopeId: string;
  status: string;
}

interface DsRecipient {
  email: string;
  status: string;
  signedDateTime?: string;
  recipientId?: string;
  clientUserId?: string;
}

interface DsEnvelopeWithRecipients extends DsEnvelopeResponse {
  recipients?: { signers?: DsRecipient[] };
}

export const docusignProvider: EsignProvider<DocusignConfig> = {
  provider: "docusign",
  displayName: "DocuSign eSignature",

  async init(config, req) {
    // 1. Create + send the envelope with the document inline (base64) and one
    //    signer recipient per requested signer. `clientUserId` marks each as an
    //    embedded (captive) signer so we can mint a recipient-view URL.
    const signers = req.signers.map((s, i) => ({
      email: s.email,
      name: s.name,
      recipientId: String(i + 1),
      clientUserId: String(i + 1),
      routingOrder: String(s.routingOrder ?? i + 1),
    }));

    const createRes = await fetch(`${apiBase(config)}/envelopes`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        emailSubject: req.title,
        emailBlurb: req.message ?? "",
        status: "sent",
        documents: [
          {
            documentBase64: req.documentBase64,
            name: req.title,
            fileExtension: "pdf",
            documentId: "1",
          },
        ],
        recipients: { signers },
        eventNotification: {
          url: req.callbackUrl,
          loggingEnabled: "true",
          requireAcknowledgment: "true",
          envelopeEvents: [
            { envelopeEventStatusCode: "sent" },
            { envelopeEventStatusCode: "delivered" },
            { envelopeEventStatusCode: "completed" },
            { envelopeEventStatusCode: "declined" },
            { envelopeEventStatusCode: "voided" },
          ],
        },
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`DocuSign init failed: ${createRes.status} ${text.slice(0, 300)}`);
    }
    const created = (await createRes.json()) as DsEnvelopeResponse;
    if (!created.envelopeId) {
      throw new Error("DocuSign init failed: no envelopeId returned");
    }

    // 2. Mint an embedded recipient-view URL per signer.
    const signingUrls: Array<{ email: string; url: string }> = [];
    for (const s of signers) {
      const viewRes = await fetch(
        `${apiBase(config)}/envelopes/${created.envelopeId}/views/recipient`,
        {
          method: "POST",
          headers: authHeaders(config),
          body: JSON.stringify({
            returnUrl: req.callbackUrl,
            authenticationMethod: "none",
            email: s.email,
            userName: s.name,
            recipientId: s.recipientId,
            clientUserId: s.clientUserId,
          }),
        },
      );
      if (!viewRes.ok) {
        const text = await viewRes.text();
        throw new Error(
          `DocuSign recipient-view failed for ${s.email}: ${viewRes.status} ${text.slice(0, 200)}`,
        );
      }
      const view = (await viewRes.json()) as { url?: string };
      if (!view.url) {
        throw new Error(`DocuSign recipient-view returned no URL for ${s.email}`);
      }
      signingUrls.push({ email: s.email, url: view.url });
    }

    return { envelopeId: created.envelopeId, signingUrls };
  },

  async getStatus(config, envelopeId) {
    const res = await fetch(
      `${apiBase(config)}/envelopes/${envelopeId}?include=recipients`,
      { headers: authHeaders(config) },
    );
    if (!res.ok) throw new Error(`DocuSign status failed: ${res.status}`);
    const json = (await res.json()) as DsEnvelopeWithRecipients;
    const signerRows = json.recipients?.signers ?? [];
    return {
      envelopeId: json.envelopeId,
      status: mapEnvelopeStatus(json.status),
      signers: signerRows.map((r) => {
        const out: {
          email: string;
          status: "pending" | "viewed" | "signed" | "declined";
          signedAt?: Date;
          aadhaarMaskedHash?: string;
          certificateHash?: string;
        } = {
          email: r.email,
          status: mapRecipientStatus(r.status),
        };
        if (r.signedDateTime) out.signedAt = new Date(r.signedDateTime);
        return out;
      }),
    };
  },

  async fetchSignedDocument(config, envelopeId) {
    const res = await fetch(
      `${apiBase(config)}/envelopes/${envelopeId}/documents/combined`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    if (!res.ok) throw new Error(`DocuSign fetch signed doc failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    return { bytes: buf, sha256 };
  },

  async verifyCallback(config, body, headers) {
    // DocuSign Connect signs the raw payload with HMAC-SHA256 and sends the
    // base64 digest in x-docusign-signature-1 (up to -3 for key rotation).
    const provided = [
      headers["x-docusign-signature-1"],
      headers["x-docusign-signature-2"],
      headers["x-docusign-signature-3"],
    ].filter((v): v is string => Boolean(v));
    if (provided.length === 0) {
      throw new Error("Missing DocuSign HMAC signature header");
    }
    const expected = crypto
      .createHmac("sha256", config.hmacKey)
      .update(body, "utf8")
      .digest("base64");
    const expectedBuf = Buffer.from(expected, "base64");
    const ok = provided.some((sig) => {
      const sigBuf = Buffer.from(sig, "base64");
      return (
        sigBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(sigBuf, expectedBuf)
      );
    });
    if (!ok) throw new Error("Invalid DocuSign callback signature");

    // Connect payload: { envelopeId, status, ... } (REST-JSON Connect format).
    const parsed = JSON.parse(body) as {
      envelopeId?: string;
      data?: { envelopeId?: string; envelopeSummary?: { status?: string } };
      status?: string;
    };
    const envelopeId = parsed.envelopeId ?? parsed.data?.envelopeId;
    const status = parsed.status ?? parsed.data?.envelopeSummary?.status;
    if (!envelopeId) throw new Error("DocuSign callback missing envelopeId");
    return {
      envelopeId,
      status: mapEnvelopeStatus(status ?? "sent"),
    };
  },
};
