/**
 * Razorpay payment gateway integration for NexusOps.
 *
 * Supports:
 *  - Creating payment orders (for invoice/expense/other collections)
 *  - Verifying webhook signatures for auto-reconciliation
 *  - UPI, Net Banking, Card, Wallet payment methods
 *
 * Configuration (env vars):
 *   RAZORPAY_KEY_ID     — Razorpay test/live key ID
 *   RAZORPAY_KEY_SECRET — Razorpay key secret
 *   RAZORPAY_WEBHOOK_SECRET — Webhook signature secret
 */

import { createHmac } from "crypto";

export interface RazorpayConfig {
  keyId:         string;
  keySecret:     string;
  webhookSecret: string;
}

function getConfig(): RazorpayConfig {
  return {
    keyId:         process.env.RAZORPAY_KEY_ID          ?? "",
    keySecret:     process.env.RAZORPAY_KEY_SECRET       ?? "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET   ?? "",
  };
}

function authHeader(): string {
  const { keyId, keySecret } = getConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

const BASE_URL = "https://api.razorpay.com/v1";

// ── Order creation ─────────────────────────────────────────────────────────

export interface CreateOrderParams {
  /** Amount in **paise** (multiply INR by 100) */
  amountPaise:  number;
  currency?:    string;
  receipt:      string;
  notes?:       Record<string, string>;
}

export interface RazorpayOrder {
  id:           string;
  entity:       string;
  amount:       number;
  currency:     string;
  receipt:      string;
  status:       "created" | "attempted" | "paid";
  notes:        Record<string, string>;
  created_at:   number;
}

export async function createOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
  const res = await fetch(`${BASE_URL}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount:   params.amountPaise,
      currency: params.currency ?? "INR",
      receipt:  params.receipt,
      notes:    params.notes ?? {},
    }),
  });

  if (!res.ok) throw new Error(`Razorpay createOrder failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RazorpayOrder;
}

// ── Payment verification ───────────────────────────────────────────────────

export interface PaymentVerifyParams {
  orderId:     string;
  paymentId:   string;
  signature:   string;
}

/** Verify Razorpay payment signature to prevent fraud. */
export function verifyPayment({ orderId, paymentId, signature }: PaymentVerifyParams): boolean {
  const { keySecret } = getConfig();
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

// ── Webhook signature verification ────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return expected === signature;
}

// ── Fetch payment details ──────────────────────────────────────────────────

export interface RazorpayPayment {
  id:           string;
  entity:       "payment";
  amount:       number;
  currency:     string;
  status:       "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id:     string;
  method:       string;
  description?: string;
  email?:       string;
  contact?:     string;
  notes:        Record<string, string>;
  created_at:   number;
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const res = await fetch(`${BASE_URL}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Razorpay fetchPayment failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RazorpayPayment;
}

// ── Reconciliation helpers ────────────────────────────────────────────────

export interface ReconciliationLine {
  paymentId:   string;
  orderId:     string;
  amount:      number;
  currency:    string;
  method:      string;
  status:      string;
  createdAt:   Date;
  matchedRef?: string;
  isMatched:   boolean;
}

/** Parse a Razorpay webhook payment.captured event into a reconciliation line. */
export function parsePaymentCapturedWebhook(payload: unknown): ReconciliationLine | null {
  const p = (payload as any)?.payload?.payment?.entity;
  if (!p) return null;
  return {
    paymentId: p.id,
    orderId:   p.order_id,
    amount:    p.amount / 100, // convert paise → INR
    currency:  p.currency,
    method:    p.method,
    status:    p.status,
    createdAt: new Date(p.created_at * 1000),
    isMatched: false,
  };
}

/** Create a simple Razorpay checkout HTML snippet (server-side rendered). */
export function createCheckoutScript(params: {
  orderId:    string;
  keyId:      string;
  amount:     number;
  name:       string;
  description?: string;
  prefillEmail?: string;
  prefillPhone?: string;
  callbackUrl: string;
}): string {
  return `
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = {
    "key": "${params.keyId}",
    "amount": ${params.amount * 100},
    "currency": "INR",
    "name": "${params.name}",
    "description": "${params.description ?? ""}",
    "order_id": "${params.orderId}",
    "prefill": {
      "email": "${params.prefillEmail ?? ""}",
      "contact": "${params.prefillPhone ?? ""}"
    },
    "handler": function(response) {
      window.location.href = "${params.callbackUrl}?payment_id=" + response.razorpay_payment_id + "&order_id=" + response.razorpay_order_id + "&signature=" + response.razorpay_signature;
    }
  };
  var rzp = new Razorpay(options);
  rzp.open();
</script>`.trim();
}
