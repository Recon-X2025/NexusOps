import type { IntegrationAdapter } from "./types";

/**
 * Google Workspace adapter — OAuth2 setup, then capability hooks for:
 *   - Gmail watch (incoming email → ticket)
 *   - Calendar event create (interview scheduling, change windows)
 *   - Drive picker (DMS bridge — handled in services/storage.ts)
 *
 * Send/webhook semantics for Gmail are domain-wide-delegated; we do not
 * implement the delegation flow here — it requires admin consent in the
 * Google Admin console which is configured by the tenant.
 */

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number; // unix seconds
}

/** Send an email through the authenticated user's Gmail account. */
export interface GmailSendMessage {
  kind: "email";
  to: string;
  subject: string;
  /** Plain-text or HTML body. */
  body: string;
  cc?: string;
  bcc?: string;
}

/** Create an event on the authenticated user's primary calendar. */
export interface GoogleCalendarEventMessage {
  kind: "calendar_event";
  summary: string;
  description?: string;
  /** ISO-8601 start/end timestamps. */
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
}

export type GoogleSendMessage = GmailSendMessage | GoogleCalendarEventMessage;

/** RFC 2822 message, base64url-encoded as required by the Gmail API. */
function buildRawEmail(msg: GmailSendMessage): string {
  const headers = [
    `To: ${msg.to}`,
    msg.cc ? `Cc: ${msg.cc}` : null,
    msg.bcc ? `Bcc: ${msg.bcc}` : null,
    `Subject: ${msg.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
  ].filter((h): h is string => h !== null);
  const raw = `${headers.join("\r\n")}\r\n\r\n${msg.body}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleWorkspaceAdapter: IntegrationAdapter<GoogleConfig, GoogleSendMessage> = {
  provider: "google_workspace",
  displayName: "Google Workspace",
  capabilities: { send: true, receive: false, oauth: true },

  async test(config) {
    if (!config.clientId || !config.clientSecret) {
      return { ok: false, details: "Missing clientId / clientSecret" };
    }
    if (!config.refreshToken) {
      return { ok: false, details: "OAuth not yet completed — no refresh token" };
    }
    return { ok: true, details: "Refresh token present" };
  },

  async send(config, message) {
    const accessToken = await refreshGoogleAccessToken(config);

    if (message.kind === "email") {
      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ raw: buildRawEmail(message) }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gmail send failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { id: string };
      return { providerRef: json.id, raw: json };
    }

    // calendar_event
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          summary: message.summary,
          description: message.description,
          location: message.location,
          start: { dateTime: message.start },
          end: { dateTime: message.end },
          attendees: message.attendees?.map((email) => ({ email })),
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Calendar event create failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: string };
    return { providerRef: json.id, raw: json };
  },

  beginOAuth({ orgId, state, redirectUri }) {
    const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: `${orgId}:${state}`,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async completeOAuth({ code, redirectUri }) {
    const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
    if (!clientId || !clientSecret) throw new Error("Google OAuth env not configured");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google token exchange failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      clientId,
      clientSecret,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: String(Math.floor(Date.now() / 1000) + json.expires_in),
    } as unknown as GoogleConfig;
  },
};

/**
 * Refresh helper — used by background workers (gmail-watch, calendar-poll)
 * before each API call.
 */
export async function refreshGoogleAccessToken(config: GoogleConfig): Promise<string> {
  if (!config.refreshToken) throw new Error("No refresh token");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}
