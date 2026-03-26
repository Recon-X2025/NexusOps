/**
 * oidc.ts — OIDC authentication service
 *
 * Flow:
 * 1. GET /auth/oidc/authorize  — redirect user to IdP
 * 2. GET /auth/oidc/callback   — receive code, exchange for tokens, map to user, create session
 * 3. GET /auth/oidc/logout     — revoke session and redirect to post-logout URL
 *
 * Configuration (ENV):
 *   OIDC_ISSUER          — e.g. https://accounts.google.com or https://login.microsoftonline.com/{tenant}/v2.0
 *   OIDC_CLIENT_ID       — client ID from your IdP
 *   OIDC_CLIENT_SECRET   — client secret
 *   OIDC_REDIRECT_URI    — must match registered callback URL, e.g. https://api.nexusops.io/auth/oidc/callback
 *   OIDC_SCOPES          — space-separated, defaults to "openid email profile"
 *
 * The returned sessionId is identical to the one from the password-based login flow.
 * Clients store it identically (localStorage + cookie).
 */
import * as openidClient from "openid-client";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb, users, accounts, organizations, eq, and } from "@nexusops/db";
import { createSession } from "../routers/auth";

const SCOPES = (process.env["OIDC_SCOPES"] ?? "openid email profile").split(" ");

/** Build the OIDC configuration object (lazy — only created on first request). */
let _oidcConfig: openidClient.Configuration | undefined;

async function getOidcConfig(): Promise<openidClient.Configuration> {
  if (_oidcConfig) return _oidcConfig;

  const issuer = process.env["OIDC_ISSUER"];
  const clientId = process.env["OIDC_CLIENT_ID"];
  const clientSecret = process.env["OIDC_CLIENT_SECRET"];

  if (!issuer || !clientId || !clientSecret) {
    throw new Error("OIDC not configured: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET must be set");
  }

  _oidcConfig = await openidClient.discovery(new URL(issuer), clientId, clientSecret);
  return _oidcConfig;
}

/** Fastify plugin to register OIDC routes. */
export async function registerOidcRoutes(fastify: FastifyInstance): Promise<void> {
  if (!process.env["OIDC_ISSUER"] || !process.env["OIDC_CLIENT_ID"]) {
    fastify.log.info("OIDC not configured — skipping OIDC routes");
    return;
  }

  const redirectUri = process.env["OIDC_REDIRECT_URI"] ?? "http://localhost:3001/auth/oidc/callback";
  const postLoginRedirect = process.env["NEXT_PUBLIC_APP_URL"]
    ? `${process.env["NEXT_PUBLIC_APP_URL"]}/app/dashboard`
    : "http://localhost:3000/app/dashboard";

  // In-memory state/nonce store (use Redis in high-availability deployments)
  const stateStore = new Map<string, { nonce: string; expiresAt: number }>();

  // Clean expired states every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of stateStore.entries()) {
      if (val.expiresAt < now) stateStore.delete(key);
    }
  }, 5 * 60_000);

  /** Step 1 — Redirect to IdP */
  fastify.get("/auth/oidc/authorize", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await getOidcConfig();
      const state = openidClient.randomState();
      const nonce = openidClient.randomNonce();

      stateStore.set(state, { nonce, expiresAt: Date.now() + 10 * 60_000 });

      const authUrl = openidClient.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: SCOPES.join(" "),
        state,
        nonce,
      });

      return reply.redirect(authUrl.toString());
    } catch (err) {
      fastify.log.error(err, "OIDC authorize error");
      return reply.status(500).send({ error: "OIDC configuration error" });
    }
  });

  /** Step 2 — Receive callback, exchange code for tokens, create session */
  fastify.get("/auth/oidc/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await getOidcConfig();
      const query = req.query as Record<string, string>;
      const state = query["state"] ?? "";
      const stateData = stateStore.get(state);

      if (!stateData || stateData.expiresAt < Date.now()) {
        return reply.status(400).send({ error: "Invalid or expired state" });
      }
      stateStore.delete(state);

      // Exchange authorization code for tokens
      const callbackUrl = new URL(
        `${redirectUri}?${new URLSearchParams(query).toString()}`
      );

      const tokens = await openidClient.authorizationCodeGrant(config, callbackUrl, {
        expectedState: state,
        expectedNonce: stateData.nonce,
        pkceCodeVerifier: undefined,
      });

      const claims = tokens.claims();
      if (!claims) return reply.status(400).send({ error: "No ID token claims" });

      const email = claims["email"] as string | undefined;
      const name = (claims["name"] as string | undefined) ?? (claims["email"] as string);
      const sub = claims["sub"] as string;

      if (!email) return reply.status(400).send({ error: "IdP did not return email claim" });

      const db = getDb();

      // Find or create the user and link account
      let [user] = await db.select().from(users).where(eq(users.email, email));

      if (!user) {
        // Auto-provision: find the first (default) org or require pre-existing invite
        const [defaultOrg] = await db.select().from(organizations).limit(1);
        if (!defaultOrg) {
          return reply.status(403).send({ error: "No organisation available for auto-provisioning" });
        }

        // Create user record
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            name: name ?? email,
            orgId: defaultOrg.id,
            passwordHash: null,
            active: true,
            mfaEnabled: false,
          } as any)
          .returning();
        user = newUser!;
      }

      // Upsert the OIDC account link
      await db
        .insert(accounts)
        .values({
          userId: user!.id,
          provider: "oidc",
          providerAccountId: sub,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
          expiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : undefined,
        })
        .onConflictDoUpdate({
          target: [accounts.provider, accounts.providerAccountId],
          set: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? undefined,
          },
        });

      // Create a NexusOps session (reuses identical logic to password login)
      const sessionId = await createSession(
        db,
        user!.id,
        req.ip ?? "unknown",
        req.headers["user-agent"] ?? "OIDC",
      );

      // Redirect to the web app with the sessionId in the URL fragment
      // The web app reads it and stores in localStorage + cookie identically to password login
      const redirectTo = new URL(postLoginRedirect);
      redirectTo.searchParams.set("session", sessionId);
      return reply.redirect(redirectTo.toString());
    } catch (err) {
      fastify.log.error(err, "OIDC callback error");
      return reply.redirect(
        `${process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"}/login?error=oidc_failed`
      );
    }
  });

  /** Step 3 — OIDC logout */
  fastify.get("/auth/oidc/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionCookie = (req.headers["cookie"] ?? "").split(";")
      .map((c: string) => c.trim().split("="))
      .find(([k]: string[]) => k === "nexusops_session");

    if (sessionCookie && sessionCookie[1]) {
      try {
        const { sessions } = await import("@nexusops/db");
        const db = getDb();
        await db.delete(sessions).where(eq(sessions.id, sessionCookie[1]));
      } catch { /* non-fatal */ }
    }

    const loginUrl = `${process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"}/login`;
    return reply.redirect(loginUrl);
  });

  fastify.log.info("OIDC routes registered at /auth/oidc/*");
}
