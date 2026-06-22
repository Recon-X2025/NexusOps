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

export const microsoft365Adapter: IntegrationAdapter<MsConfig> = {
  provider: "microsoft_365",
  displayName: "Microsoft 365",
  capabilities: { send: false, receive: false, oauth: true },

  async test(config) {
    if (!config.clientId || !config.clientSecret || !config.tenantId) {
      return { ok: false, details: "Missing clientId / clientSecret / tenantId" };
    }
    if (!config.refreshToken) return { ok: false, details: "OAuth not completed" };
    return { ok: true };
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
