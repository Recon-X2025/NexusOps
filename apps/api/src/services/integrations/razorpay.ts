import { verifyHmac } from "../encryption";
import type { IntegrationAdapter, WebhookEnvelope } from "./types";

/**
 * Razorpay payment-link adapter.
 *
 * Use case at GA: create a payment link from an AR invoice; webhook flips
 * the invoice to "paid" and posts a journal entry. Settlement reconciliation
 * in v1.1.
 */

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface PaymentLinkRequest {
  amountPaise: number;
  currency: "INR";
  description: string;
  customer: { name: string; email?: string; contact?: string };
  notify?: { sms?: boolean; email?: boolean };
  callbackUrl?: string;
  referenceId?: string; // our invoice id
  expireBy?: number; // unix seconds
}

const API_BASE = "https://api.razorpay.com/v1";

function basicAuth(c: RazorpayConfig): string {
  return "Basic " + Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64");
}

export const razorpayAdapter: IntegrationAdapter<RazorpayConfig, PaymentLinkRequest> = {
  provider: "razorpay",
  displayName: "Razorpay",
  capabilities: { send: true, receive: true, oauth: false },

  async test(config) {
    if (!config.keyId || !config.keySecret) return { ok: false, details: "Missing keys" };
    const res = await fetch(`${API_BASE}/payments?count=1`, {
      headers: { Authorization: basicAuth(config) },
    });
    return { ok: res.ok, details: `HTTP ${res.status}` };
  },

  async send(config, message) {
    const res = await fetch(`${API_BASE}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(config),
      },
      body: JSON.stringify({
        amount: message.amountPaise,
        currency: message.currency,
        description: message.description,
        customer: message.customer,
        notify: message.notify ?? { sms: true, email: true },
        callback_url: message.callbackUrl,
        callback_method: "get",
        reference_id: message.referenceId,
        expire_by: message.expireBy,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Razorpay payment-link create failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: string; short_url: string; status: string };
    return { providerRef: json.id, raw: json };
  },

  async receiveWebhook(config, body, headers) {
    const sig = headers["x-razorpay-signature"] ?? "";
    if (!sig || !verifyHmac(config.webhookSecret, body, sig)) {
      throw new Error("Invalid Razorpay webhook signature");
    }
    const parsed = JSON.parse(body) as {
      event?: string;
      payload?: { payment?: { entity: Record<string, unknown> } };
    };
    return {
      kind: parsed.event ?? "unknown",
      payload: parsed.payload ?? {},
    };
  },
};
