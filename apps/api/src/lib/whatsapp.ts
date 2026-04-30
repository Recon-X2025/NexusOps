/**
 * WhatsApp Business Cloud API integration for CoheronConnect.
 *
 * Supports:
 *  - Sending text, template, and interactive messages
 *  - Parsing inbound webhook payloads
 *  - Creating ITSM tickets from WhatsApp messages
 *
 * Configuration (env vars):
 *   WHATSAPP_PHONE_NUMBER_ID  — Meta Business phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — System user access token
 *   WHATSAPP_WEBHOOK_SECRET   — Token to verify webhook subscriptions
 */

import { createHmac, timingSafeEqual } from "crypto";

const API_VERSION = "v19.0";
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`;

type WaSendResponse = { messages?: Array<{ id?: string }> };

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken:   string;
  webhookSecret: string;
}

function getConfig(): WhatsAppConfig {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken:   process.env.WHATSAPP_ACCESS_TOKEN    ?? "",
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET  ?? "",
  };
}

// ── Send helpers ───────────────────────────────────────────────────────────

export async function sendTextMessage(to: string, text: string): Promise<{ messageId: string }> {
  const { phoneNumberId, accessToken } = getConfig();
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as WaSendResponse;
  return { messageId: data.messages?.[0]?.id ?? "" };
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components: object[],
): Promise<{ messageId: string }> {
  const { phoneNumberId, accessToken } = getConfig();
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  });

  if (!res.ok) throw new Error(`WhatsApp template send failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as WaSendResponse;
  return { messageId: data.messages?.[0]?.id ?? "" };
}

/** Send interactive list message (used for ticket status, approval prompts). */
export async function sendListMessage(
  to: string,
  header: string,
  body: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  buttonText = "Options",
): Promise<{ messageId: string }> {
  const { phoneNumberId, accessToken } = getConfig();
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp not configured");

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: header },
        body: { text: body },
        action: { button: buttonText, sections },
      },
    }),
  });

  if (!res.ok) throw new Error(`WhatsApp list message failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as WaSendResponse;
  return { messageId: data.messages?.[0]?.id ?? "" };
}

// ── Webhook handling ───────────────────────────────────────────────────────

export interface InboundMessage {
  from:      string;
  messageId: string;
  timestamp: number;
  type:      "text" | "interactive" | "image" | "document" | "audio" | "video" | "sticker" | "location" | "contacts" | "button";
  text?:     string;
  interactive?: {
    type:     "button_reply" | "list_reply";
    id:       string;
    title:    string;
  };
  profileName?: string;
  phoneNumberId: string;
}

export function parseInboundWebhook(body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  const payload = body as any;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id ?? "";

      for (const msg of value?.messages ?? []) {
        const m: InboundMessage = {
          from:         msg.from,
          messageId:    msg.id,
          timestamp:    Number(msg.timestamp),
          type:         msg.type,
          phoneNumberId,
          profileName:  value?.contacts?.[0]?.profile?.name,
        };

        if (msg.type === "text") m.text = msg.text?.body;
        if (msg.type === "interactive") {
          const iv = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
          m.interactive = { type: msg.interactive?.type, id: iv?.id ?? "", title: iv?.title ?? "" };
        }

        messages.push(m);
      }
    }
  }
  return messages;
}

/** Verify that the webhook payload was signed by Meta. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) return false;
  const expected = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Notification templates for CoheronConnect modules ───────────────────────────

/** Send a ticket assignment notification via WhatsApp. */
export async function notifyTicketAssignment(params: {
  to:              string;
  ticketNumber:    string;
  ticketTitle:     string;
  assigneeName:    string;
  priority:        string;
  portalUrl:       string;
}) {
  const { to, ticketNumber, ticketTitle, assigneeName, priority, portalUrl } = params;
  const message = [
    `🎫 *New Ticket Assigned* — ${ticketNumber}`,
    `*${ticketTitle}*`,
    `Assigned to: ${assigneeName}`,
    `Priority: ${priority.toUpperCase()}`,
    `→ ${portalUrl}`,
  ].join("\n");
  return sendTextMessage(to, message);
}

/** Send leave approval notification. */
export async function notifyLeaveApproval(params: {
  to:          string;
  employeeName: string;
  leaveType:   string;
  startDate:   string;
  endDate:     string;
  approved:    boolean;
}) {
  const icon = params.approved ? "✅" : "❌";
  const status = params.approved ? "APPROVED" : "REJECTED";
  const message = [
    `${icon} *Leave Request ${status}*`,
    `Employee: ${params.employeeName}`,
    `Type: ${params.leaveType}`,
    `Dates: ${params.startDate} – ${params.endDate}`,
  ].join("\n");
  return sendTextMessage(params.to, message);
}

/** Send expense claim status notification. */
export async function notifyExpenseStatus(params: {
  to:        string;
  claimNumber: string;
  title:     string;
  amount:    number;
  status:    string;
}) {
  const icon = params.status === "approved" ? "✅" : params.status === "rejected" ? "❌" : "ℹ️";
  const message = [
    `${icon} *Expense ${params.status.toUpperCase()}* — ${params.claimNumber}`,
    `${params.title}`,
    `Amount: ₹${params.amount.toLocaleString("en-IN")}`,
  ].join("\n");
  return sendTextMessage(params.to, message);
}
