import type { IntegrationAdapter, AdapterTestResult } from "./types";

/**
 * Slack via Incoming Webhooks — chosen because:
 *   - Zero-OAuth setup: org admin pastes an incoming webhook URL from a Slack
 *     app, no token storage / refresh dance required.
 *   - The webhook is already channel-bound on Slack's side, so message routing
 *     is a Slack-admin concern, not ours.
 *
 * The webhook URL is the credential — it is stored encrypted like every other
 * integration config (see ../encryption.ts). A leaked URL only allows posting
 * into the one bound channel, so blast radius is contained.
 *
 * Migration to the full Slack Web API (chat.postMessage with a bot token) is a
 * config-only swap: the `send()` surface here maps cleanly onto it.
 */

export interface SlackConfig {
  /** Slack incoming webhook URL, e.g. https://hooks.slack.com/services/T.../B.../xxxx */
  webhookUrl: string;
  /** Optional channel override label (display-only; the webhook is channel-bound). */
  defaultChannel?: string;
}

export interface SlackMessage {
  title: string;
  body: string;
  /** Absolute URL to deep-link back into the app. */
  link?: string;
  /** Drives the accent colour of the attachment bar. */
  type?: "info" | "warning" | "success" | "error";
}

/** Slack attachment accent colours keyed by notification type. */
const COLORS: Record<NonNullable<SlackMessage["type"]>, string> = {
  info: "#6366f1",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

function isSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

/** Build a Block Kit payload with a coloured attachment bar + optional link button. */
/**
 * Exported so the worker/tests can assert the exact wire shape Slack receives
 * without making a live POST.
 */
export function buildSlackPayload(message: SlackMessage): unknown {
  const color = COLORS[message.type ?? "info"];
  const blocks: unknown[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${message.title}*\n${message.body}` },
    },
  ];
  if (message.link) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in CoheronConnect" },
          url: message.link,
        },
      ],
    });
  }
  return {
    text: message.title, // notification fallback for clients that don't render blocks
    attachments: [{ color, blocks }],
  };
}

export const slackAdapter: IntegrationAdapter<SlackConfig, SlackMessage> = {
  provider: "slack",
  displayName: "Slack",
  capabilities: { send: true, receive: false, oauth: false },

  async test(config): Promise<AdapterTestResult> {
    if (!config.webhookUrl) return { ok: false, details: "Missing webhookUrl" };
    if (!isSlackWebhookUrl(config.webhookUrl)) {
      return { ok: false, details: "webhookUrl must be an https://hooks.slack.com/... URL" };
    }
    // We deliberately do NOT post a live test message: every webhook POST lands
    // in the customer's real channel, so a "test" would spam it. URL shape is
    // validated above; the first real notification is the live proof.
    return { ok: true, details: "Webhook URL is well-formed (live post skipped to avoid channel spam)" };
  },

  async send(config, message) {
    if (!isSlackWebhookUrl(config.webhookUrl)) {
      throw new Error("Invalid Slack webhook URL");
    }
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSlackPayload(message)),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Slack send failed: ${res.status} ${text.slice(0, 200)}`);
    }
    // Incoming webhooks return the literal string "ok" on success — there is no
    // message id to surface, so we use the channel label (or "ok") as the ref.
    return { providerRef: config.defaultChannel ?? "ok", raw: await res.text() };
  },
};
