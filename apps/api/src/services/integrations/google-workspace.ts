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

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleWorkspaceAdapter: IntegrationAdapter<GoogleConfig> = {
  provider: "google_workspace",
  displayName: "Google Workspace",
  capabilities: { send: false, receive: false, oauth: true },

  async test(config) {
    if (!config.clientId || !config.clientSecret) {
      return { ok: false, details: "Missing clientId / clientSecret" };
    }
    if (!config.refreshToken) {
      return { ok: false, details: "OAuth not yet completed — no refresh token" };
    }
    return { ok: true, details: "Refresh token present" };
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
