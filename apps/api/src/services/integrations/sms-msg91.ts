import type { IntegrationAdapter } from "./types";

/**
 * SMS via MSG91 — DLT-compliant by design.
 *
 * DLT (TRAI mandate) requires: registered sender ID, registered template ID,
 * and consent records. MSG91 enforces all three at API level — we just pass
 * the registered template id + variables.
 */

interface Msg91Config {
  authKey: string;
  senderId: string;
  routeId?: string;
}

export interface SmsMessage {
  to: string; // E.164 (e.g. +919876543210)
  templateId: string; // DLT-registered template id
  variables: Record<string, string>;
}

export const smsMsg91Adapter: IntegrationAdapter<Msg91Config, SmsMessage> = {
  provider: "sms_msg91",
  displayName: "SMS (MSG91)",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config) {
    if (!config.authKey || !config.senderId) {
      return { ok: false, details: "Missing authKey or senderId" };
    }
    const res = await fetch("https://control.msg91.com/api/v5/widget/getWidgetData", {
      method: "GET",
      headers: { authkey: config.authKey },
    });
    return { ok: res.status !== 401, details: `HTTP ${res.status}` };
  },

  async send(config, message) {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: config.authKey,
      },
      body: JSON.stringify({
        template_id: message.templateId,
        sender: config.senderId,
        recipients: [{ mobiles: message.to.replace(/^\+/, ""), ...message.variables }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MSG91 send failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { message?: string; type?: string };
    return { providerRef: json.message ?? "", raw: json };
  },
};
