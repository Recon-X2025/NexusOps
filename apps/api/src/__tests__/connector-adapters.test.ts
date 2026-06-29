import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import { whatsAppAiSensyAdapter } from "../services/integrations/whatsapp-aisensy";
import { smsMsg91Adapter } from "../services/integrations/sms-msg91";
import { razorpayAdapter } from "../services/integrations/razorpay";
import { clearTaxGstAdapter } from "../services/integrations/cleartax-gst";
import {
  getIntegrationAdapter,
  listSupportedProviders,
} from "../services/integrations/registry";

/**
 * Connector smoke + unit tests for the four adapters not already covered by
 * slack-adapter.test.ts / productivity-adapters.test.ts, plus the registry.
 *
 * No live network: fetch is stubbed per-test, and webhook signatures are
 * computed with the same HMAC-SHA256 hex scheme used by verifyHmac() so the
 * happy-path verification exercises the real comparison.
 */

/** Build a fetch mock returning the given responses in order. Returns the
 * recorded calls so assertions can inspect URL + body. */
function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { status: 200, body: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

/** Compute a valid HMAC-SHA256 hex signature matching verifyHmac(). */
function hmacHex(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── WhatsApp (AiSensy) ──────────────────────────────────────────────────────

describe("whatsAppAiSensyAdapter", () => {
  const config = { apiKey: "key", webhookSecret: "whsec" };

  it("test() flags a missing apiKey", async () => {
    const res = await whatsAppAiSensyAdapter.test({ apiKey: "", webhookSecret: "" });
    expect(res.ok).toBe(false);
    expect(res.details).toMatch(/apiKey/i);
  });

  it("test() passes when apiKey is present (no live ping)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await whatsAppAiSensyAdapter.test(config);
    expect(res.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("send() posts to the campaign API and returns the messageId", async () => {
    const calls = mockFetchSequence([{ status: 200, body: { messageId: "wamid-1" } }]);
    const res = await whatsAppAiSensyAdapter.send!(config, {
      to: "+919876543210",
      campaignName: "welcome",
      templateParams: { name: "Asha" },
    });
    expect(res.providerRef).toBe("wamid-1");
    expect(calls[0]!.url).toContain("backend.aisensy.com");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.campaignName).toBe("welcome");
    expect(body.templateParams).toEqual(["Asha"]);
  });

  it("send() falls back to submitted_message_id", async () => {
    mockFetchSequence([{ status: 200, body: { submitted_message_id: "sub-9" } }]);
    const res = await whatsAppAiSensyAdapter.send!(config, {
      to: "+910000000000",
      campaignName: "c",
    });
    expect(res.providerRef).toBe("sub-9");
  });

  it("send() throws on a non-OK response", async () => {
    mockFetchSequence([{ status: 400, body: { error: "bad" } }]);
    await expect(
      whatsAppAiSensyAdapter.send!(config, { to: "+910000000000", campaignName: "c" }),
    ).rejects.toThrow(/AiSensy send failed: 400/);
  });

  it("receiveWebhook() rejects a bad signature", async () => {
    const body = JSON.stringify({ type: "message", from: "+91", messageId: "m1" });
    await expect(
      whatsAppAiSensyAdapter.receiveWebhook!(config, body, { "x-aisensy-signature": "deadbeef" }),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("receiveWebhook() parses an inbound message with a valid signature", async () => {
    const body = JSON.stringify({ from: "+919876543210", messageId: "m1", text: { body: "hi" } });
    const env = await whatsAppAiSensyAdapter.receiveWebhook!(config, body, {
      "x-aisensy-signature": hmacHex(config.webhookSecret, body),
    });
    expect(env.kind).toBe("message.inbound");
    expect(env.providerRef).toBe("m1");
    expect(env.payload).toMatchObject({ from: "+919876543210", text: "hi" });
  });

  it("receiveWebhook() maps a delivery status event", async () => {
    const body = JSON.stringify({ status: { name: "delivered", messageId: "m2" } });
    const env = await whatsAppAiSensyAdapter.receiveWebhook!(config, body, {
      "x-signature": hmacHex(config.webhookSecret, body),
    });
    expect(env.kind).toBe("message.status.delivered");
    expect(env.providerRef).toBe("m2");
  });
});

// ─── SMS (MSG91) ─────────────────────────────────────────────────────────────

describe("smsMsg91Adapter", () => {
  const config = { authKey: "ak", senderId: "COHERN" };

  it("test() flags missing credentials", async () => {
    const res = await smsMsg91Adapter.test({ authKey: "", senderId: "" });
    expect(res.ok).toBe(false);
    expect(res.details).toMatch(/authKey|senderId/i);
  });

  it("test() is ok when the widget endpoint does not return 401", async () => {
    mockFetchSequence([{ status: 200, body: {} }]);
    const res = await smsMsg91Adapter.test(config);
    expect(res.ok).toBe(true);
  });

  it("test() is not ok on a 401", async () => {
    mockFetchSequence([{ status: 401, body: {} }]);
    const res = await smsMsg91Adapter.test(config);
    expect(res.ok).toBe(false);
    expect(res.details).toContain("401");
  });

  it("send() strips the leading + and posts template params", async () => {
    const calls = mockFetchSequence([{ status: 200, body: { message: "req-1", type: "success" } }]);
    const res = await smsMsg91Adapter.send!(config, {
      to: "+919876543210",
      templateId: "tmpl-1",
      variables: { otp: "123456" },
    });
    expect(res.providerRef).toBe("req-1");
    expect(calls[0]!.url).toContain("control.msg91.com/api/v5/flow");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.template_id).toBe("tmpl-1");
    expect(body.recipients[0].mobiles).toBe("919876543210");
    expect(body.recipients[0].otp).toBe("123456");
  });

  it("send() throws on a non-OK response", async () => {
    mockFetchSequence([{ status: 500, body: { error: "boom" } }]);
    await expect(
      smsMsg91Adapter.send!(config, { to: "+910000000000", templateId: "t", variables: {} }),
    ).rejects.toThrow(/MSG91 send failed: 500/);
  });
});

// ─── Razorpay ────────────────────────────────────────────────────────────────

describe("razorpayAdapter", () => {
  const config = { keyId: "rzp_k", keySecret: "secret", webhookSecret: "whsec" };

  it("test() flags missing keys", async () => {
    const res = await razorpayAdapter.test({ keyId: "", keySecret: "", webhookSecret: "" });
    expect(res.ok).toBe(false);
    expect(res.details).toMatch(/keys/i);
  });

  it("test() sends a basic-auth header and reports HTTP status", async () => {
    const calls = mockFetchSequence([{ status: 200, body: { count: 0, items: [] } }]);
    const res = await razorpayAdapter.test(config);
    expect(res.ok).toBe(true);
    const auth = (calls[0]!.init!.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Basic /);
    const decoded = Buffer.from(auth.replace("Basic ", ""), "base64").toString();
    expect(decoded).toBe("rzp_k:secret");
  });

  it("send() creates a payment link and returns its id", async () => {
    const calls = mockFetchSequence([
      { status: 200, body: { id: "plink_1", short_url: "https://rzp.io/l/x", status: "created" } },
    ]);
    const res = await razorpayAdapter.send!(config, {
      amountPaise: 150000,
      currency: "INR",
      description: "AR invoice INV-1",
      customer: { name: "Acme", email: "ap@acme.test" },
      referenceId: "INV-1",
    });
    expect(res.providerRef).toBe("plink_1");
    expect(calls[0]!.url).toContain("api.razorpay.com/v1/payment_links");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.amount).toBe(150000);
    expect(body.reference_id).toBe("INV-1");
  });

  it("send() throws on a non-OK response", async () => {
    mockFetchSequence([{ status: 400, body: { error: { description: "bad amount" } } }]);
    await expect(
      razorpayAdapter.send!(config, {
        amountPaise: 0,
        currency: "INR",
        description: "x",
        customer: { name: "n" },
      }),
    ).rejects.toThrow(/Razorpay payment-link create failed: 400/);
  });

  it("receiveWebhook() rejects a bad signature", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    await expect(
      razorpayAdapter.receiveWebhook!(config, body, { "x-razorpay-signature": "nope" }),
    ).rejects.toThrow(/Invalid Razorpay webhook signature/);
  });

  it("receiveWebhook() returns the event kind on a valid signature", async () => {
    const body = JSON.stringify({
      event: "payment_link.paid",
      payload: { payment: { entity: { id: "pay_1" } } },
    });
    const env = await razorpayAdapter.receiveWebhook!(config, body, {
      "x-razorpay-signature": hmacHex(config.webhookSecret, body),
    });
    expect(env.kind).toBe("payment_link.paid");
    expect(env.payload).toMatchObject({ payment: { entity: { id: "pay_1" } } });
  });
});

// ─── ClearTax GST ────────────────────────────────────────────────────────────

describe("clearTaxGstAdapter", () => {
  const config = {
    apiKey: "k",
    apiSecret: "s",
    gstin: "27AAPFU0939F1ZV",
    environment: "sandbox" as const,
  };

  it("test() flags missing credentials", async () => {
    const res = await clearTaxGstAdapter.test({ apiKey: "", apiSecret: "", gstin: "" });
    expect(res.ok).toBe(false);
    expect(res.details).toMatch(/apiKey|apiSecret|gstin/i);
  });

  it("test() rejects a malformed GSTIN", async () => {
    const res = await clearTaxGstAdapter.test({ ...config, gstin: "NOT-A-GSTIN" });
    expect(res.ok).toBe(false);
    expect(res.details).toMatch(/GSTIN format/i);
  });

  it("test() passes a well-formed GSTIN without a live ping", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await clearTaxGstAdapter.test(config);
    expect(res.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("send() targets the sandbox base and returns the IRN", async () => {
    const calls = mockFetchSequence([{ status: 200, body: { Data: { irn: "IRN-123" } } }]);
    const res = await clearTaxGstAdapter.send!(config, {
      invoiceNumber: "INV-1",
      invoiceDate: "01/07/2026",
      invoiceType: "INV",
      supplyType: "B2B",
      buyerGstin: "29AAGCB1286Q1ZN",
      buyerName: "Buyer Co",
      buyerStateCode: "29",
      totalAmount: 1180,
      taxableAmount: 1000,
      cgst: 90,
      sgst: 90,
      igst: 0,
      lineItems: [
        {
          description: "Widget",
          hsnCode: "8471",
          quantity: 1,
          unitPrice: 1000,
          taxableValue: 1000,
          gstRate: 18,
        },
      ],
    });
    expect(res.providerRef).toBe("IRN-123");
    expect(calls[0]!.url).toContain("einv-apisandbox.cleartax.in");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers.gstin).toBe("27AAPFU0939F1ZV");
  });

  it("send() targets the production base when environment=production", async () => {
    const calls = mockFetchSequence([{ status: 200, body: { Data: { irn: "IRN-P" } } }]);
    await clearTaxGstAdapter.send!(
      { ...config, environment: "production" },
      {
        invoiceNumber: "INV-2",
        invoiceDate: "01/07/2026",
        invoiceType: "INV",
        supplyType: "B2B",
        buyerName: "Buyer",
        buyerStateCode: "29",
        totalAmount: 100,
        taxableAmount: 100,
        cgst: 0,
        sgst: 0,
        igst: 0,
        lineItems: [],
      },
    );
    expect(calls[0]!.url).toContain("einv-api.cleartax.in");
  });

  it("send() throws on a non-OK response", async () => {
    mockFetchSequence([{ status: 422, body: { error: "invalid" } }]);
    await expect(
      clearTaxGstAdapter.send!(config, {
        invoiceNumber: "INV-3",
        invoiceDate: "01/07/2026",
        invoiceType: "INV",
        supplyType: "B2B",
        buyerName: "Buyer",
        buyerStateCode: "29",
        totalAmount: 100,
        taxableAmount: 100,
        cgst: 0,
        sgst: 0,
        igst: 0,
        lineItems: [],
      }),
    ).rejects.toThrow(/ClearTax IRN failed: 422/);
  });
});

// ─── Registry ────────────────────────────────────────────────────────────────

describe("integration registry", () => {
  const EXPECTED = [
    "whatsapp_aisensy",
    "sms_msg91",
    "razorpay",
    "cleartax_gst",
    "google_workspace",
    "microsoft_365",
    "slack",
  ];

  it("resolves every registered provider to an adapter", () => {
    for (const provider of EXPECTED) {
      const adapter = getIntegrationAdapter(provider);
      expect(adapter, `adapter for ${provider}`).not.toBeNull();
      expect(adapter!.provider).toBe(provider);
    }
  });

  it("returns null for an unknown provider", () => {
    expect(getIntegrationAdapter("does_not_exist")).toBeNull();
  });

  it("lists all supported providers with capabilities", () => {
    const list = listSupportedProviders();
    expect(list.map((p) => p.provider).sort()).toEqual([...EXPECTED].sort());
    for (const p of list) {
      expect(p.capabilities).toHaveProperty("send");
    }
  });

  it("every adapter conforms to the IntegrationAdapter contract", () => {
    for (const provider of EXPECTED) {
      const adapter = getIntegrationAdapter(provider)!;
      expect(typeof adapter.test).toBe("function");
      expect(typeof adapter.displayName).toBe("string");
      if (adapter.capabilities.send) expect(typeof adapter.send).toBe("function");
      if (adapter.capabilities.receive) expect(typeof adapter.receiveWebhook).toBe("function");
      if (adapter.capabilities.oauth) {
        expect(typeof adapter.beginOAuth).toBe("function");
        expect(typeof adapter.completeOAuth).toBe("function");
      }
    }
  });
});
