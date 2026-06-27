import type { IntegrationAdapter } from "./types";

/**
 * Microsoft 365 adapter — Entra ID (Azure AD) OAuth + Graph API.
 *
 * Capability hooks:
 *   - SSO via OIDC (already plumbed in services/oidc.ts; this adapter wires
 *     the tenant-side admin consent + Graph token storage)
 *   - Outlook subscription → ticket
 *   - Teams notify (channel + chat message)
 */

interface MsConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
}

/** Send an email through the authenticated user's Outlook mailbox. */
export interface OutlookSendMessage {
  kind: "email";
  to: string;
  subject: string;
  /** HTML body. */
  body: string;
  cc?: string;
  bcc?: string;
}

/** Create an event on the authenticated user's Outlook calendar. */
export interface OutlookCalendarEventMessage {
  kind: "calendar_event";
  summary: string;
  description?: string;
  /** ISO-8601 start/end timestamps. */
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
}

export type MicrosoftSendMessage = OutlookSendMessage | OutlookCalendarEventMessage;

function toRecipients(addresses?: string): Array<{ emailAddress: { address: string } }> {
  if (!addresses) return [];
  return addresses
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

const SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.ReadWrite",
  "Calendars.ReadWrite",
  "ChannelMessage.Send",
  "offline_access",
].join(" ");

export const microsoft365Adapter: IntegrationAdapter<MsConfig, MicrosoftSendMessage> = {
  provider: "microsoft_365",
  displayName: "Microsoft 365",
  capabilities: { send: true, receive: false, oauth: true },

  async test(config) {
    if (!config.clientId || !config.clientSecret || !config.tenantId) {
      return { ok: false, details: "Missing clientId / clientSecret / tenantId" };
    }
    if (!config.refreshToken) return { ok: false, details: "OAuth not completed" };
    return { ok: true };
  },

  async send(config, message) {
    const accessToken = await refreshMicrosoftAccessToken(config);

    if (message.kind === "email") {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.body },
            toRecipients: toRecipients(message.to),
            ccRecipients: toRecipients(message.cc),
            bccRecipients: toRecipients(message.bcc),
          },
          saveToSentItems: true,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Outlook send failed: ${res.status} ${text.slice(0, 200)}`);
      }
      // sendMail returns 202 Accepted with no body.
      return { providerRef: "accepted" };
    }

    // calendar_event
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: message.summary,
        body: message.description ? { contentType: "HTML", content: message.description } : undefined,
        start: { dateTime: message.start, timeZone: "UTC" },
        end: { dateTime: message.end, timeZone: "UTC" },
        location: message.location ? { displayName: message.location } : undefined,
        attendees: message.attendees?.map((address) => ({
          emailAddress: { address },
          type: "required",
        })),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Outlook calendar event create failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: string };
    return { providerRef: json.id, raw: json };
  },

  beginOAuth({ orgId, state, redirectUri }) {
    const clientId = process.env["MS_OAUTH_CLIENT_ID"];
    const tenantId = process.env["MS_OAUTH_TENANT_ID"] ?? "common";
    if (!clientId) throw new Error("MS_OAUTH_CLIENT_ID not configured");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES,
      state: `${orgId}:${state}`,
      prompt: "consent",
    });
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async completeOAuth({ code, redirectUri }) {
    const clientId = process.env["MS_OAUTH_CLIENT_ID"];
    const clientSecret = process.env["MS_OAUTH_CLIENT_SECRET"];
    const tenantId = process.env["MS_OAUTH_TENANT_ID"] ?? "common";
    if (!clientId || !clientSecret) throw new Error("Microsoft OAuth env not configured");

    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft token exchange failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      clientId,
      clientSecret,
      tenantId,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: String(Math.floor(Date.now() / 1000) + json.expires_in),
    } as unknown as MsConfig;
  },
};

/**
 * Refresh helper — used by send() and background workers before each Graph
 * API call. Returns a short-lived access token from the stored refresh token.
 */
export async function refreshMicrosoftAccessToken(config: MsConfig): Promise<string> {
  if (!config.refreshToken) throw new Error("No refresh token");
  const tenantId = config.tenantId || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}

export async function postTeamsChannelMessage(
  accessToken: string,
  teamId: string,
  channelId: string,
  text: string,
): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ body: { contentType: "html", content: text } }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Teams channel post failed: ${res.status} ${t.slice(0, 200)}`);
  }
}
