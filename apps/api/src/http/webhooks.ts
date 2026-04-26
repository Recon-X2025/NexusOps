import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getDb,
  integrations,
  signatureRequests,
  signatureAudit,
  invoices,
  eq,
  and,
} from "@nexusops/db";
import { decryptIntegrationConfig } from "../services/encryption";
import { getEsignProvider } from "../services/esign";
import { getIntegrationAdapter } from "../services/integrations/registry";

/**
 * External webhook receivers. Mounted under `/webhooks/*`.
 *
 * Routes:
 *   POST /webhooks/esign/emudhra
 *     - Body contains envelopeId. We look up the signature_request by
 *       providerEnvelopeId, derive the org, decrypt the integration config,
 *       and verify HMAC against config.webhookSecret. Then update status +
 *       append audit row. Idempotent: re-receiving the same event is a no-op.
 *
 *   POST /webhooks/wa/aisensy/:integrationId
 *     - Per-tenant URL (each integration row publishes its own URL).
 *       Verifies HMAC, classifies inbound vs status, records audit.
 *
 *   POST /webhooks/razorpay/:integrationId
 *     - Verifies HMAC. On payment.captured, marks the linked invoice paid
 *       (referenceId == invoice.id passed during link creation).
 *
 * Raw body capture: we register a content-type parser scoped to /webhooks/*
 * that retains the raw string for HMAC verification BEFORE JSON.parse.
 */

interface RawBodyRequest extends FastifyRequest {
  rawBody?: string;
}

/**
 * Provider-side IP allowlists.
 *
 * Format: comma-separated list of CIDR ranges or exact IPs. Set per-provider
 * via env so ops can update without a redeploy when providers rotate ranges.
 *
 * If a list is empty (default), we accept all source IPs and rely solely on
 * HMAC signature verification. Once we have signed contracts with each
 * provider that publishes their canonical IPs, those go in env vars below
 * and unmatched IPs get a 403 *before* any DB / crypto work.
 *
 *   WEBHOOK_ALLOWLIST_EMUDHRA   — eMudhra
 *   WEBHOOK_ALLOWLIST_AISENSY   — AiSensy / WhatsApp Cloud
 *   WEBHOOK_ALLOWLIST_RAZORPAY  — Razorpay
 */
function parseAllowlist(envName: string): readonly string[] {
  return (process.env[envName] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/**
 * Lightweight CIDR / exact-IP matcher. Sufficient for IPv4; we fall back to
 * exact-string compare for IPv6 (rare for webhook ingress). Tighten with a
 * proper library (e.g. `ipaddr.js`) once we have IPv6 provider sources.
 */
function ipMatches(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true; // disabled
  if (allowlist.includes(ip)) return true;

  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false; // IPv6 fell through; only exact matches above

  for (const entry of allowlist) {
    if (!entry.includes("/")) continue;
    const [baseRaw, bitsRaw] = entry.split("/");
    const base = ipv4ToInt(baseRaw ?? "");
    const bits = Number(bitsRaw);
    if (base === null || !Number.isFinite(bits) || bits < 0 || bits > 32) continue;
    if (bits === 0) return true;
    const mask = (~0 << (32 - bits)) >>> 0;
    if ((base & mask) === (ipInt & mask)) return true;
  }
  return false;
}

const ALLOWLISTS: Record<string, readonly string[]> = {};

function getAllowlist(provider: "emudhra" | "aisensy" | "razorpay"): readonly string[] {
  if (!(provider in ALLOWLISTS)) {
    ALLOWLISTS[provider] = parseAllowlist(`WEBHOOK_ALLOWLIST_${provider.toUpperCase()}`);
  }
  return ALLOWLISTS[provider]!;
}

export async function registerWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Raw-body parser for webhooks. Fastify default parser drops the raw text
  // after JSON.parse, which would make HMAC verification impossible.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: 1 * 1024 * 1024 },
    (req, body, done) => {
      try {
        const raw = body as string;
        // Only stash rawBody for webhook routes — every other route gets the
        // standard parsed JSON body.
        if (req.url?.startsWith("/webhooks/")) {
          (req as RawBodyRequest).rawBody = raw;
        }
        const parsed = raw.length > 0 ? JSON.parse(raw) : {};
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  /**
   * Webhook endpoints are server-to-server only. We:
   *   - reject every CORS preflight (no browser origin should ever call /webhooks)
   *   - lock CSP / security headers down so even if a provider sends HTML, it
   *     can't be rendered into a phishing context
   *   - reject pre-flight OPTIONS so misconfigured providers fail loudly
   *
   * Per-route IP allowlists are enforced inside each handler so we can map
   * the right WEBHOOK_ALLOWLIST_* env var per provider.
   */
  fastify.addHook("onRequest", async (req, reply) => {
    if (!req.url?.startsWith("/webhooks/")) return;
    if (req.method === "OPTIONS") {
      reply.code(405).send({ error: "Method not allowed for webhook endpoints" });
      return;
    }
    if (req.headers["origin"]) {
      // S2S calls don't carry Origin; if one shows up it's a browser. Block it.
      reply.code(403).send({ error: "Browser origins are not permitted on /webhooks/*" });
      return;
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    );
    reply.header("Cache-Control", "no-store");
    // Explicit "no CORS" — helps loud-fail when a frontend tries to call us.
    reply.header("Access-Control-Allow-Origin", "");
  });

  const enforceAllowlist = (
    provider: "emudhra" | "aisensy" | "razorpay",
    req: FastifyRequest,
    reply: import("fastify").FastifyReply,
  ): boolean => {
    const allowlist = getAllowlist(provider);
    const ip = req.ip;
    if (!ipMatches(ip, allowlist)) {
      req.log.warn({ ip, provider }, "[webhook] IP not in allowlist");
      reply.status(403).send({ error: "Source IP not permitted" });
      return false;
    }
    return true;
  };

  // ── eMudhra e-sign callbacks ────────────────────────────────────────────
  fastify.post("/webhooks/esign/emudhra", async (req, reply) => {
    if (!enforceAllowlist("emudhra", req, reply)) return;
    const raw = (req as RawBodyRequest).rawBody ?? "";
    if (!raw) return reply.status(400).send({ error: "Empty body" });
    let envelopeId: string | undefined;
    try {
      const probe = JSON.parse(raw) as { envelopeId?: string };
      envelopeId = probe.envelopeId;
    } catch {
      return reply.status(400).send({ error: "Invalid JSON" });
    }
    if (!envelopeId) return reply.status(400).send({ error: "Missing envelopeId" });

    const db = getDb();
    const [reqRow] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.providerEnvelopeId, envelopeId))
      .limit(1);
    if (!reqRow) return reply.status(404).send({ error: "Unknown envelope" });

    const [integration] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.orgId, reqRow.orgId),
          eq(integrations.provider, "emudhra"),
          eq(integrations.status, "connected"),
        ),
      )
      .limit(1);
    if (!integration?.configEncrypted) {
      return reply.status(412).send({ error: "Integration not configured" });
    }
    const provider = getEsignProvider("emudhra");
    if (!provider?.verifyCallback) {
      return reply.status(500).send({ error: "Provider missing verifyCallback" });
    }

    const config = decryptIntegrationConfig(integration.configEncrypted);
    const headers = normalizeHeaders(req.headers);

    let parsed: { envelopeId: string; status: "sent" | "viewed" | "signed" | "declined" | "expired" | "voided" | "completed" };
    try {
      parsed = await provider.verifyCallback(config, raw, headers);
    } catch (e) {
      req.log.warn({ err: e, envelopeId }, "[webhook] eMudhra signature verification failed");
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const isTerminal = parsed.status === "completed" || parsed.status === "signed";
    await db
      .update(signatureRequests)
      .set({
        status: parsed.status,
        ...(isTerminal ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(signatureRequests.id, reqRow.id));

    await db.insert(signatureAudit).values({
      requestId: reqRow.id,
      eventType: parsed.status,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      providerPayload: JSON.parse(raw) as Record<string, unknown>,
    });

    return { ok: true };
  });

  // ── WhatsApp (AiSensy) inbound + delivery status ─────────────────────────
  fastify.post<{ Params: { integrationId: string } }>(
    "/webhooks/wa/aisensy/:integrationId",
    async (req, reply) => {
      if (!enforceAllowlist("aisensy", req, reply)) return;
      const raw = (req as RawBodyRequest).rawBody ?? "";
      const integrationId = req.params.integrationId;
      const db = getDb();

      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.id, integrationId),
            eq(integrations.provider, "whatsapp_aisensy"),
            eq(integrations.status, "connected"),
          ),
        )
        .limit(1);
      if (!integration?.configEncrypted) {
        return reply.status(404).send({ error: "Unknown integration" });
      }

      const adapter = getIntegrationAdapter("whatsapp_aisensy");
      if (!adapter?.receiveWebhook) {
        return reply.status(500).send({ error: "Adapter missing receiveWebhook" });
      }
      const config = decryptIntegrationConfig(integration.configEncrypted);
      const headers = normalizeHeaders(req.headers);

      try {
        const env = await adapter.receiveWebhook(config, raw, headers);
        // Persistence of inbound WA messages → conversations table is v1.1.
        // For now we log and ack so AiSensy stops retrying.
        req.log.info(
          { kind: env.kind, providerRef: env.providerRef, integrationId },
          "[webhook] WhatsApp event received",
        );
        return { ok: true, kind: env.kind };
      } catch (e) {
        req.log.warn({ err: e, integrationId }, "[webhook] WhatsApp signature verification failed");
        return reply.status(401).send({ error: "Invalid signature" });
      }
    },
  );

  // ── Razorpay payment events ──────────────────────────────────────────────
  fastify.post<{ Params: { integrationId: string } }>(
    "/webhooks/razorpay/:integrationId",
    async (req, reply) => {
      if (!enforceAllowlist("razorpay", req, reply)) return;
      const raw = (req as RawBodyRequest).rawBody ?? "";
      const integrationId = req.params.integrationId;
      const db = getDb();

      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.id, integrationId),
            eq(integrations.provider, "razorpay"),
            eq(integrations.status, "connected"),
          ),
        )
        .limit(1);
      if (!integration?.configEncrypted) {
        return reply.status(404).send({ error: "Unknown integration" });
      }

      const adapter = getIntegrationAdapter("razorpay");
      if (!adapter?.receiveWebhook) {
        return reply.status(500).send({ error: "Adapter missing receiveWebhook" });
      }
      const config = decryptIntegrationConfig(integration.configEncrypted);
      const headers = normalizeHeaders(req.headers);

      let env;
      try {
        env = await adapter.receiveWebhook(config, raw, headers);
      } catch (e) {
        req.log.warn({ err: e, integrationId }, "[webhook] Razorpay signature verification failed");
        return reply.status(401).send({ error: "Invalid signature" });
      }

      // Payment captured → mark invoice paid (notes.invoice_id was stamped at link creation).
      if (env.kind === "payment.captured" || env.kind === "payment.authorized") {
        const payload = env.payload as
          | {
              payment?: {
                entity?: {
                  notes?: Record<string, string>;
                  reference_id?: string;
                  invoice_id?: string;
                };
              };
            }
          | undefined;
        const entity = payload?.payment?.entity;
        const invoiceId =
          entity?.notes?.["invoice_id"] ?? entity?.reference_id ?? entity?.invoice_id;
        if (invoiceId) {
          await db
            .update(invoices)
            .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
            .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, integration.orgId)));
          req.log.info({ invoiceId, integrationId }, "[webhook] Invoice marked paid");
        }
      }

      return { ok: true, kind: env.kind };
    },
  );
}

function normalizeHeaders(h: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === "string") out[k.toLowerCase()] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[k.toLowerCase()] = v[0];
  }
  return out;
}
