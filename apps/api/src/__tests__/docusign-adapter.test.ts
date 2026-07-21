/**
 * DocuSign e-sign adapter tests (G17).
 *
 * Exercises the four EsignProvider methods against a stubbed fetch (no live
 * network / DocuSign account):
 *   - init()      → creates the envelope then mints a recipient-view URL per
 *                   signer; maps the response onto {envelopeId, signingUrls}.
 *   - getStatus() → maps DocuSign envelope + recipient statuses onto our unions.
 *   - fetchSignedDocument() → downloads the combined PDF + hashes it.
 *   - verifyCallback() → validates the DocuSign Connect HMAC-SHA256 signature
 *                   (base64 in x-docusign-signature-1) and normalises status.
 */
import crypto from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { docusignProvider } from "../services/esign/docusign";

const config = {
  accessToken: "tok-abc",
  accountId: "acct-guid-1",
  basePath: "https://demo.docusign.net",
  hmacKey: "connect-hmac-key",
  environment: "sandbox" as const,
};

/** Queue of responses returned in call order; each entry stubs one fetch call. */
function mockFetchSequence(
  responses: Array<{ ok?: boolean; status?: number; json?: unknown; buffer?: Buffer; text?: string }>,
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { ok: true, json: {} };
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json ?? {},
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
      arrayBuffer: async () => {
        const b = r.buffer ?? Buffer.from("");
        // Return a standalone ArrayBuffer sliced to the Buffer's view — a Node
        // Buffer's .buffer is a shared pool, so hand back only its own bytes.
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

describe("DocuSign adapter (G17)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("init creates an envelope and mints a signing URL per signer", async () => {
    const calls = mockFetchSequence([
      { json: { envelopeId: "env-1", status: "sent" } }, // create envelope
      { json: { url: "https://demo.docusign.net/signing/env-1/alice" } }, // recipient view #1
      { json: { url: "https://demo.docusign.net/signing/env-1/bob" } }, // recipient view #2
    ]);

    const res = await docusignProvider.init(config, {
      title: "MSA",
      message: "Please sign",
      documentBase64: Buffer.from("%PDF-1.4 dummy").toString("base64"),
      documentSha256: "a".repeat(64),
      signers: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
      callbackUrl: "https://api.example.com/webhooks/esign/docusign",
    });

    expect(res.envelopeId).toBe("env-1");
    expect(res.signingUrls).toHaveLength(2);
    expect(res.signingUrls[0]).toEqual({
      email: "alice@example.com",
      url: "https://demo.docusign.net/signing/env-1/alice",
    });

    // create call hits /envelopes with the account-scoped v2.1 path + bearer token
    expect(calls[0]!.url).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct-guid-1/envelopes",
    );
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.status).toBe("sent");
    expect(body.recipients.signers).toHaveLength(2);
    expect(body.recipients.signers[0].clientUserId).toBe("1");
    expect(body.eventNotification.url).toBe(
      "https://api.example.com/webhooks/esign/docusign",
    );

    // recipient-view calls hit /views/recipient
    expect(calls[1]!.url).toContain("/envelopes/env-1/views/recipient");
    expect(calls[2]!.url).toContain("/envelopes/env-1/views/recipient");
  });

  it("init throws when envelope creation fails", async () => {
    mockFetchSequence([{ ok: false, status: 401, text: "invalid token" }]);
    await expect(
      docusignProvider.init(config, {
        title: "MSA",
        documentBase64: "x",
        documentSha256: "a".repeat(64),
        signers: [{ name: "Alice", email: "alice@example.com" }],
        callbackUrl: "https://api.example.com/webhooks/esign/docusign",
      }),
    ).rejects.toThrow(/DocuSign init failed: 401/);
  });

  it("getStatus maps DocuSign envelope + recipient statuses onto our unions", async () => {
    mockFetchSequence([
      {
        json: {
          envelopeId: "env-2",
          status: "completed",
          recipients: {
            signers: [
              { email: "alice@example.com", status: "completed", signedDateTime: "2026-07-20T10:00:00Z" },
              { email: "bob@example.com", status: "delivered" },
            ],
          },
        },
      },
    ]);

    const status = await docusignProvider.getStatus(config, "env-2");
    expect(status.envelopeId).toBe("env-2");
    expect(status.status).toBe("completed");
    expect(status.signers[0]!.status).toBe("signed");
    expect(status.signers[0]!.signedAt).toBeInstanceOf(Date);
    expect(status.signers[1]!.status).toBe("viewed");
  });

  it("fetchSignedDocument returns the combined PDF + its sha256", async () => {
    const pdf = Buffer.from("%PDF-1.4 signed bytes");
    const calls = mockFetchSequence([{ buffer: pdf }]);

    const doc = await docusignProvider.fetchSignedDocument(config, "env-3");
    expect(calls[0]!.url).toContain("/envelopes/env-3/documents/combined");
    expect(doc.bytes.equals(pdf)).toBe(true);
    expect(doc.sha256).toBe(crypto.createHash("sha256").update(pdf).digest("hex"));
  });

  it("verifyCallback accepts a correctly HMAC-signed body and normalises status", async () => {
    const payload = JSON.stringify({ envelopeId: "env-4", status: "completed" });
    const sig = crypto
      .createHmac("sha256", config.hmacKey)
      .update(payload, "utf8")
      .digest("base64");

    const res = await docusignProvider.verifyCallback(config, payload, {
      "x-docusign-signature-1": sig,
    });
    expect(res.envelopeId).toBe("env-4");
    expect(res.status).toBe("completed");
  });

  it("verifyCallback reads envelopeId + status from the nested Connect data shape", async () => {
    const payload = JSON.stringify({
      data: { envelopeId: "env-5", envelopeSummary: { status: "declined" } },
    });
    const sig = crypto
      .createHmac("sha256", config.hmacKey)
      .update(payload, "utf8")
      .digest("base64");

    const res = await docusignProvider.verifyCallback(config, payload, {
      "x-docusign-signature-1": sig,
    });
    expect(res.envelopeId).toBe("env-5");
    expect(res.status).toBe("declined");
  });

  it("verifyCallback rejects a tampered / mis-signed body", async () => {
    const payload = JSON.stringify({ envelopeId: "env-6", status: "completed" });
    const badSig = crypto
      .createHmac("sha256", "wrong-key")
      .update(payload, "utf8")
      .digest("base64");

    await expect(
      docusignProvider.verifyCallback(config, payload, { "x-docusign-signature-1": badSig }),
    ).rejects.toThrow(/Invalid DocuSign callback signature/);
  });

  it("verifyCallback rejects when no signature header is present", async () => {
    const payload = JSON.stringify({ envelopeId: "env-7", status: "completed" });
    await expect(
      docusignProvider.verifyCallback(config, payload, {}),
    ).rejects.toThrow(/Missing DocuSign HMAC signature/);
  });
});
