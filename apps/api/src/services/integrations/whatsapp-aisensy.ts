import { verifyHmac } from "../encryption";
import type { IntegrationAdapter, WebhookEnvelope } from "./types";

/**
 * WhatsApp via AiSensy BSP — chosen because:
 *   - Indian-incorporated entity, pricing in INR
 *   - Faster Meta template approval cycle than direct
 *   - Same Cloud-API capabilities (templates, media, interactive buttons)
 *
 * Migration to direct Cloud API is a config-only swap because the
 * adapter surface here matches the underlying Cloud API.
 */

interface AiSensyConfig {
  apiKey: string;
  webhookSecret: string;
  defaultSenderId?: string;
}

export interface WhatsAppMessage {
  to: string;
  campaignName: string;
  templateParams?: Record<string, string>;
  media?: { url: string; filename?: string };
  buttonValues?: Record<string, string>;
}

const API_BASE = "https://backend.aisensy.com/campaign/t1/api/v2";

export const whatsAppAiSensyAdapter: IntegrationAdapter<AiSensyConfig, WhatsAppMessage> = {
  provider: "whatsapp_aisensy",
  displayName: "WhatsApp (AiSensy)",
  capabilities: { send: true, receive: true, oauth: false },

  async test(config) {
    if (!config.apiKey) return { ok: false, details: "Missing apiKey" };
    return { ok: true, details: "API key present (live ping skipped — counts against AiSensy quota)" };
  },

  async send(config, message) {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: config.apiKey,
        campaignName: message.campaignName,
        destination: message.to,
        userName: message.to,
        templateParams: message.templateParams ? Object.values(message.templateParams) : [],
        ...(message.media ? { media: message.media } : {}),
        ...(message.buttonValues ? { buttonValues: message.buttonValues } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AiSensy send failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { messageId?: string; submitted_message_id?: string };
    const providerRef = json.messageId ?? json.submitted_message_id ?? "";
    return { providerRef, raw: json };
  },

  async receiveWebhook(config, body, headers) {
    const sig = headers["x-aisensy-signature"] ?? headers["x-signature"] ?? "";
    if (!sig || !verifyHmac(config.webhookSecret, body, sig)) {
      throw new Error("Invalid webhook signature");
    }
    const parsed = JSON.parse(body) as {
      type?: string;
      from?: string;
      messageId?: string;
      text?: { body?: string };
      status?: { name?: string; messageId?: string };
    };
    if (parsed.status) {
      const env: WebhookEnvelope = {
        kind: `message.status.${parsed.status.name ?? "unknown"}`,
        payload: parsed,
      };
      if (parsed.status.messageId !== undefined) env.providerRef = parsed.status.messageId;
      return env;
    }
    const env: WebhookEnvelope = {
      kind: "message.inbound",
      payload: { from: parsed.from, text: parsed.text?.body },
    };
    if (parsed.messageId !== undefined) env.providerRef = parsed.messageId;
    return env;
  },
};
