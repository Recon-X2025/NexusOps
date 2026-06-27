/**
 * saml.ts — SAML 2.0 SSO service (SP-initiated, per-org IdP config).
 *
 * Flow:
 * 1. GET  /auth/saml/login?org=<slug>  — build a signed AuthnRequest, redirect
 *                                         the browser to the org's IdP.
 * 2. POST /auth/saml/callback          — Assertion Consumer Service (ACS). The
 *                                         IdP POSTs a signed SAML Response; we
 *                                         validate it, map the assertion to a
 *                                         local user, and mint a session.
 * 3. GET  /auth/saml/metadata?org=<slug> — SP metadata XML for IdP admins.
 *
 * Security model:
 * - Per-org config lives in `organizations.settings.sso.saml` (IdP entryPoint,
 *   issuer, and X.509 signing cert). We build a `SAML` instance scoped to that
 *   org so signature verification uses *that org's* IdP cert only.
 * - `validatePostResponseAsync` (node-saml) performs XML-DSig verification,
 *   NotBefore/NotOnOrAfter window checks, and Audience restriction matching.
 *   `wantAssertionsSigned` rejects unsigned assertions (prevents signature
 *   wrapping / unsigned-assertion injection).
 * - Provisioning is org-scoped: the user is matched/created *within the org the
 *   flow was started for*. The IdP cannot assert a user into a different org.
 *
 * The returned session token is identical to the password and OIDC flows; the
 * web app stores it the same way (localStorage + cookie).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SAML, type SamlConfig, type Profile } from "@node-saml/node-saml";
import { getDb, users, accounts, organizations, eq } from "@coheronconnect/db";
import { createSession } from "../routers/auth";
import { getOrgSamlConfig, type EffectiveSamlConfig } from "../lib/org-settings";

/** SP base URL (this API) — must be reachable by the IdP for the ACS POST. */
function spBaseUrl(): string {
  return process.env["SAML_SP_BASE_URL"] ?? process.env["API_PUBLIC_URL"] ?? "http://localhost:3001";
}

/** SP entityID (issuer in our AuthnRequest; audience the IdP must restrict to). */
function spEntityId(): string {
  return process.env["SAML_SP_ENTITY_ID"] ?? `${spBaseUrl()}/auth/saml/metadata`;
}

function acsCallbackUrl(): string {
  return `${spBaseUrl()}/auth/saml/callback`;
}

function postLoginRedirect(): string {
  return process.env["NEXT_PUBLIC_APP_URL"]
    ? `${process.env["NEXT_PUBLIC_APP_URL"]}/app/dashboard`
    : "http://localhost:3000/app/dashboard";
}

function loginErrorRedirect(reason: string): string {
  const base = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  return `${base}/login?error=${encodeURIComponent(reason)}`;
}

/** Normalize a PEM cert body into the header/footer-wrapped form node-saml expects. */
function normalizeCert(cert: string): string {
  const trimmed = cert.trim();
  if (trimmed.includes("BEGIN CERTIFICATE")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

/** Build a per-org node-saml instance from the org's stored IdP config. */
function buildSamlInstance(cfg: EffectiveSamlConfig): SAML {
  const options: SamlConfig = {
    callbackUrl: acsCallbackUrl(),
    entryPoint: cfg.entryPoint,
    issuer: spEntityId(),
    idpCert: normalizeCert(cfg.idpCert),
    // Restrict the assertion audience to our SP entityID (mitigates token reuse
    // against a different SP). The IdP must set <AudienceRestriction> to this.
    audience: spEntityId(),
    // Reject responses/assertions that are not signed by the configured IdP cert.
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    // Modest clock skew tolerance for NotBefore/NotOnOrAfter checks.
    acceptedClockSkewMs: 30_000,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    // We don't persist AuthnRequest IDs across nodes; rely on signature + time
    // window + audience rather than InResponseTo correlation.
    validateInResponseTo: "never" as SamlConfig["validateInResponseTo"],
    ...(cfg.idpIssuer ? { idpIssuer: cfg.idpIssuer } : {}),
  };
  return new SAML(options);
}

/** Resolve an org (id + settings) by its slug, or null. */
async function resolveOrgBySlug(slug: string) {
  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org ?? null;
}

/** Pull email + name from a validated SAML profile, honoring attribute mapping. */
function extractIdentity(
  profile: Profile,
  mapping?: { email?: string; name?: string },
): { email: string | null; name: string | null } {
  const attr = (key?: string): string | null => {
    if (!key) return null;
    const v = profile[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const email =
    attr(mapping?.email) ??
    (typeof profile.email === "string" ? profile.email : null) ??
    (typeof profile.mail === "string" ? profile.mail : null) ??
    (typeof profile["urn:oid:0.9.2342.19200300.100.1.3"] === "string"
      ? (profile["urn:oid:0.9.2342.19200300.100.1.3"] as string)
      : null) ??
    // NameID is an email when identifierFormat is emailAddress.
    (typeof profile.nameID === "string" && profile.nameID.includes("@") ? profile.nameID : null);

  const name =
    attr(mapping?.name) ??
    (typeof profile["displayName"] === "string" ? (profile["displayName"] as string) : null) ??
    (typeof profile["cn"] === "string" ? (profile["cn"] as string) : null);

  return {
    email: email ? email.trim().toLowerCase() : null,
    name: name ? name.trim() : null,
  };
}

/** Parse an application/x-www-form-urlencoded body into a flat string map. */
function parseFormUrlEncoded(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw).entries()) out[k] = v;
  return out;
}

/** Fastify plugin to register SAML routes. */
export async function registerSamlRoutes(fastify: FastifyInstance): Promise<void> {
  // The IdP POSTs the assertion as application/x-www-form-urlencoded. Fastify's
  // default parser only handles JSON, so register a urlencoded parser. SAML
  // Responses are base64 XML and can be large — allow up to 2 MB.
  if (!fastify.hasContentTypeParser("application/x-www-form-urlencoded")) {
    fastify.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 2 * 1024 * 1024 },
      (_req, body, done) => {
        try {
          done(null, parseFormUrlEncoded(body as string));
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );
  }

  /** Step 1 — SP-initiated login: redirect to the org's IdP. */
  fastify.get("/auth/saml/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const slug = (query["org"] ?? "").trim();
    if (!slug) return reply.redirect(loginErrorRedirect("saml_missing_org"));

    const org = await resolveOrgBySlug(slug);
    if (!org) return reply.redirect(loginErrorRedirect("saml_unknown_org"));

    const cfg = getOrgSamlConfig(org.settings);
    if (!cfg) return reply.redirect(loginErrorRedirect("saml_not_configured"));

    try {
      const saml = buildSamlInstance(cfg);
      // RelayState carries the org slug so the ACS callback knows which org's
      // IdP cert to validate against. It is not security-bearing on its own —
      // the assertion signature is what authenticates the response.
      const url = await saml.getAuthorizeUrlAsync(slug, req.hostname, {});
      return reply.redirect(url);
    } catch (err) {
      fastify.log.error(err, "SAML authorize error");
      return reply.redirect(loginErrorRedirect("saml_authorize_failed"));
    }
  });

  /** Step 2 — Assertion Consumer Service: validate signed response, mint session. */
  fastify.post("/auth/saml/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as Record<string, string>;
    const samlResponse = body["SAMLResponse"];
    const relayState = (body["RelayState"] ?? "").trim();

    if (!samlResponse) return reply.redirect(loginErrorRedirect("saml_no_response"));
    if (!relayState) return reply.redirect(loginErrorRedirect("saml_no_relaystate"));

    const org = await resolveOrgBySlug(relayState);
    if (!org) return reply.redirect(loginErrorRedirect("saml_unknown_org"));

    const cfg = getOrgSamlConfig(org.settings);
    if (!cfg) return reply.redirect(loginErrorRedirect("saml_not_configured"));

    let profile: Profile | null;
    try {
      const saml = buildSamlInstance(cfg);
      // Performs XML-DSig signature verification (against cfg.idpCert),
      // NotBefore / NotOnOrAfter window, and Audience restriction checks.
      const result = await saml.validatePostResponseAsync(body);
      profile = result.profile;
    } catch (err) {
      fastify.log.warn(err, "SAML response validation failed");
      return reply.redirect(loginErrorRedirect("saml_invalid_assertion"));
    }

    if (!profile) return reply.redirect(loginErrorRedirect("saml_invalid_assertion"));

    const { email, name } = extractIdentity(profile, cfg.attributeMapping);
    if (!email) return reply.redirect(loginErrorRedirect("saml_no_email"));

    const db = getDb();

    // Org-scoped match: the IdP can only assert users into the org the flow
    // started for. Never fall through to a different org.
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (user && user.orgId !== org.id) {
      // Email belongs to a different org — refuse rather than cross-link.
      fastify.log.warn(
        { email, assertedOrg: org.id, userOrg: user.orgId },
        "SAML email maps to a user in a different org — rejecting",
      );
      return reply.redirect(loginErrorRedirect("saml_org_mismatch"));
    }

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name: name ?? email,
          orgId: org.id,
          passwordHash: null,
          status: "active",
        } as typeof users.$inferInsert)
        .returning();
      user = newUser!;
    }

    // Link the SAML account (NameID is the stable subject identifier).
    const providerAccountId =
      typeof profile.nameID === "string" && profile.nameID ? profile.nameID : email;
    try {
      await db
        .insert(accounts)
        .values({
          userId: user.id,
          provider: "saml",
          providerAccountId,
        })
        .onConflictDoUpdate({
          target: [accounts.provider, accounts.providerAccountId],
          set: { userId: user.id },
        });
    } catch (err) {
      // Account linking is non-fatal — the session is the source of truth.
      fastify.log.warn(err, "SAML account link upsert failed (non-fatal)");
    }

    const session = await createSession(
      db,
      user.id,
      req.ip ?? "unknown",
      req.headers["user-agent"] ?? "SAML",
    );

    const redirectTo = new URL(postLoginRedirect());
    redirectTo.searchParams.set("session", session.token);
    return reply.redirect(redirectTo.toString());
  });

  /** SP metadata XML — hand to IdP admins to configure the connection. */
  fastify.get("/auth/saml/metadata", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const slug = (query["org"] ?? "").trim();

    // Metadata is identical regardless of org (single SP); org param is accepted
    // for convenience but not required. Use a dummy cert config to render it.
    const saml = new SAML({
      callbackUrl: acsCallbackUrl(),
      issuer: spEntityId(),
      idpCert: "unused-for-metadata",
      audience: spEntityId(),
    } as SamlConfig);

    const metadata = saml.generateServiceProviderMetadata(null, null);
    void slug;
    return reply.header("Content-Type", "application/xml").send(metadata);
  });

  fastify.log.info("SAML routes registered at /auth/saml/*");
}
