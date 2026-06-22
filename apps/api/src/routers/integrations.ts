import crypto from "node:crypto";
import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  integrations,
  webhooks,
  webhookDeliveries,
  apiKeys,
  eq,
  and,
  desc,
} from "@coheronconnect/db";
import { syncJiraToNexus } from "../services/jira";
import { syncSapToNexus } from "../services/sap";
import { encryptIntegrationConfig, decryptIntegrationConfig } from "../services/encryption";
import { getIntegrationAdapter } from "../services/integrations/registry";
import { getEsignProvider } from "../services/esign";

/**
 * Server-side catalog of supported provider configurations.
 *
 * The admin UI (`/app/settings/integrations`) renders these as cards with
 * an inline form for the operator to paste credentials. The shape is the
 * single source of truth for "what config does provider X need" — the
 * router validates against the field keys, encrypts the JSON blob, and
 * the adapters read the same field names server-side.
 *
 * Adding a new provider here is a 3-step PR:
 *   1. Implement the IntegrationAdapter or EsignProvider.
 *   2. Add it to the registry in `services/integrations/registry.ts`
 *      (or `services/esign/index.ts` for an e-sign provider).
 *   3. Add the catalog entry below — UI updates automatically.
 */
type ConfigField = {
  key: string;
  label: string;
  type?: "text" | "password" | "url" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
};

type ProviderCatalogEntry = {
  provider: string;
  displayName: string;
  category: "chat" | "email" | "itsm" | "messaging" | "payments" | "tax" | "identity" | "esign";
  /** True when the registry can run a live test() to validate the config. */
  testable: boolean;
  description: string;
  docsUrl?: string;
  fields: readonly ConfigField[];
};

const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    provider: "slack",
    displayName: "Slack",
    category: "chat",
    testable: false,
    description: "Post ticket notifications, approvals, and SLA alerts to Slack channels.",
    fields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", type: "url", required: true, placeholder: "https://hooks.slack.com/services/…" },
      { key: "defaultChannel", label: "Default Channel", placeholder: "#coheronconnect-alerts" },
    ],
  },
  {
    provider: "teams",
    displayName: "Microsoft Teams",
    category: "chat",
    testable: false,
    description: "Send adaptive card notifications to Teams channels.",
    fields: [
      { key: "webhookUrl", label: "Connector Webhook URL", type: "url", required: true, placeholder: "https://…webhook.office.com/…" },
    ],
  },
  {
    provider: "email",
    displayName: "SMTP / Email",
    category: "email",
    testable: false,
    description: "Configure outbound email for notifications and ticket updates.",
    fields: [
      { key: "host", label: "SMTP Host", required: true, placeholder: "smtp.sendgrid.net" },
      { key: "port", label: "Port", type: "number", placeholder: "587" },
      { key: "user", label: "Username / API Key", required: true },
      { key: "pass", label: "Password", type: "password", required: true },
      { key: "from", label: "From address", required: true, placeholder: "noreply@yourcompany.com" },
    ],
  },
  {
    provider: "jira",
    displayName: "Jira Cloud",
    category: "itsm",
    testable: false,
    description: "Bidirectional sync — CoheronConnect tickets ↔ Jira issues.",
    fields: [
      { key: "baseUrl", label: "Jira Base URL", type: "url", required: true, placeholder: "https://yourco.atlassian.net" },
      { key: "email", label: "Account Email", required: true, placeholder: "admin@yourco.com" },
      { key: "apiToken", label: "API Token", type: "password", required: true },
      { key: "projectKey", label: "Project Key", required: true, placeholder: "OPS" },
    ],
  },
  {
    provider: "sap",
    displayName: "SAP",
    category: "itsm",
    testable: false,
    description: "Connect to SAP REST APIs for asset and procurement sync.",
    fields: [
      { key: "baseUrl", label: "SAP Base URL", type: "url", required: true },
      { key: "clientId", label: "Client ID", required: true },
      { key: "secret", label: "Client Secret", type: "password", required: true },
    ],
  },
  // ── India-first connectors ────────────────────────────────────────────
  {
    provider: "whatsapp_aisensy",
    displayName: "WhatsApp (AiSensy)",
    category: "messaging",
    testable: true,
    description: "Send WhatsApp notifications via AiSensy on the WhatsApp Business Cloud API.",
    docsUrl: "https://aisensy.com/api-documentation",
    fields: [
      { key: "apiKey", label: "AiSensy API Key", type: "password", required: true },
      { key: "wabaId", label: "WhatsApp Business Account ID", required: true, placeholder: "1234567890123" },
      { key: "phoneNumberId", label: "Phone Number ID", required: true },
      { key: "webhookSecret", label: "Webhook Verify Token", type: "password", required: true,
        helpText: "Used to verify inbound webhooks. Set the same value in your AiSensy console." },
    ],
  },
  {
    provider: "sms_msg91",
    displayName: "SMS (MSG91)",
    category: "messaging",
    testable: true,
    description: "DLT-compliant transactional SMS via MSG91 for OTPs, ticket updates, and payment reminders.",
    docsUrl: "https://docs.msg91.com",
    fields: [
      { key: "authKey", label: "MSG91 Auth Key", type: "password", required: true },
      { key: "senderId", label: "Sender ID (DLT)", required: true, placeholder: "NEXOPS" },
      { key: "templateId", label: "Default Template ID", required: true, helpText: "DLT-approved template." },
      { key: "route", label: "Route", placeholder: "4 (transactional)", helpText: "MSG91 route id; default 4." },
    ],
  },
  {
    provider: "razorpay",
    displayName: "Razorpay",
    category: "payments",
    testable: true,
    description: "Collect customer invoice payments and reconcile via webhooks. UPI / cards / netbanking.",
    docsUrl: "https://razorpay.com/docs/api",
    fields: [
      { key: "keyId", label: "Razorpay Key ID", required: true, placeholder: "rzp_live_…" },
      { key: "keySecret", label: "Razorpay Key Secret", type: "password", required: true },
      { key: "webhookSecret", label: "Webhook Secret", type: "password", required: true,
        helpText: "Set this in Razorpay Dashboard → Webhooks for HMAC verification." },
    ],
  },
  {
    provider: "cleartax_gst",
    displayName: "ClearTax GST (IRN)",
    category: "tax",
    testable: true,
    description: "Generate IRN + e-invoices for B2B invoices ≥ ₹5 cr aggregate turnover (mandatory in India).",
    docsUrl: "https://cleartax.in/s/gst-api",
    fields: [
      { key: "clientId", label: "Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "gstin", label: "Filing GSTIN", required: true, placeholder: "29ABCDE1234F1Z5" },
      { key: "environment", label: "Environment", type: "select", required: true,
        options: [
          { value: "sandbox", label: "Sandbox" },
          { value: "production", label: "Production" },
        ] },
    ],
  },
  {
    provider: "google_workspace",
    displayName: "Google Workspace",
    category: "identity",
    testable: false,
    description: "OAuth-based directory + calendar + email integration. Requires Workspace admin consent.",
    fields: [
      { key: "clientId", label: "OAuth Client ID", required: true },
      { key: "clientSecret", label: "OAuth Client Secret", type: "password", required: true },
      { key: "domain", label: "Workspace Domain", required: true, placeholder: "yourcompany.com" },
    ],
  },
  {
    provider: "microsoft_365",
    displayName: "Microsoft 365",
    category: "identity",
    testable: false,
    description: "Azure AD OAuth + Graph API for SSO, calendar, and Outlook mail-tap.",
    fields: [
      { key: "tenantId", label: "Azure Tenant ID", required: true },
      { key: "clientId", label: "App Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
    ],
  },
  // ── E-sign provider — keyed as integrations.provider = "emudhra" so it ──
  // matches signatureRequests.provider, the esign router lookup in
  // routers/esign.ts (eq(integrations.provider, input.provider) where
  // input.provider defaults to "emudhra"), and the webhook receiver
  // in http/webhooks.ts. Do NOT rename to "esign_emudhra" without
  // migrating all four call sites.
  {
    provider: "emudhra",
    displayName: "eMudhra Aadhaar e-Sign",
    category: "esign",
    testable: true,
    description:
      "ASP-licensed Aadhaar e-Sign + DSC for contracts, offer letters, board resolutions. India-only legally binding.",
    docsUrl: "https://emsigner.com/developers",
    fields: [
      { key: "apiKey", label: "API Key", required: true },
      { key: "apiSecret", label: "API Secret", type: "password", required: true },
      { key: "webhookSecret", label: "Webhook Secret", type: "password", required: true,
        helpText: "Used to verify status callbacks at /webhooks/esign/emudhra." },
      { key: "signerId", label: "ASP Signer ID", helpText: "Optional — eMudhra-issued signer identifier." },
      { key: "environment", label: "Environment", type: "select", required: true,
        options: [
          { value: "sandbox", label: "Sandbox" },
          { value: "production", label: "Production" },
        ] },
    ],
  },
] as const;

const PROVIDER_IDS = PROVIDER_CATALOG.map((c) => c.provider) as [string, ...string[]];
const ProviderEnum = z.enum(PROVIDER_IDS as [string, ...string[]]);

// ─── Integrations (Slack, Teams, Jira, SAP …) ────────────────────────────────

export const integrationsRouter = router({
  /** Phase C3 — curated connector catalogue (status is roadmap / availability, not live health). */
  hubCatalog: permissionProcedure("settings", "read").query(() => ({
    connectors: [
      { id: "email", label: "Email (SMTP / inbound)", category: "notification", tier: "ga" },
      { id: "slack", label: "Slack", category: "chat", tier: "ga" },
      { id: "teams", label: "Microsoft Teams", category: "chat", tier: "beta" },
      { id: "jira", label: "Jira Cloud / DC", category: "itsm", tier: "ga" },
      { id: "servicenow", label: "ServiceNow (spoke)", category: "itsm", tier: "planned" },
      { id: "salesforce", label: "Salesforce Service Cloud", category: "crm", tier: "planned" },
    ] as const,
  })),

  // ── Integration providers ──────────────────────────────────────────────
  listIntegrations: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(integrations)
      .where(eq(integrations.orgId, org!.id))
      .orderBy(integrations.provider);
  }),

  /**
   * Returns the catalog of supported providers with their config field
   * schemas. Drives the admin UI form rendering.
   */
  providerCatalog: permissionProcedure("settings", "read").query(() => PROVIDER_CATALOG),

  upsertIntegration: permissionProcedure("settings", "write")
    .input(
      z.object({
        provider: ProviderEnum,
        config: z.record(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const catalog = PROVIDER_CATALOG.find((c) => c.provider === input.provider);
      if (!catalog) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown provider: ${input.provider}` });
      }
      const missing = catalog.fields
        .filter((f) => f.required && !(input.config[f.key]?.trim()))
        .map((f) => f.label);
      if (missing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required field(s): ${missing.join(", ")}`,
        });
      }

      const appSecret = process.env["APP_SECRET"];
      if (!appSecret) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "APP_SECRET is not configured" });
      }
      const encrypted = encryptIntegrationConfig(input.config);

      const existing = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(and(eq(integrations.orgId, org!.id), eq(integrations.provider, input.provider)));

      const kmsKeyId = process.env["INTEGRATIONS_KMS_KEY_ID"] ?? "coheronconnect:local-dev-kek";
      const dekWrappedB64 = crypto
        .createHash("sha256")
        .update(appSecret + ":" + kmsKeyId)
        .digest("base64");

      if (existing[0]) {
        const [updated] = await db
          .update(integrations)
          .set({
            configEncrypted: encrypted,
            kmsKeyId,
            dekWrappedB64,
            status: "connected",
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, existing[0].id))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
        return updated;
      }

      const [created] = await db
        .insert(integrations)
        .values({
          orgId: org!.id,
          provider: input.provider,
          configEncrypted: encrypted,
          kmsKeyId,
          dekWrappedB64,
          status: "connected",
        })
        .returning();
      return created;
    }),

  disconnectIntegration: permissionProcedure("settings", "write")
    .input(z.object({ provider: ProviderEnum }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .update(integrations)
        .set({
          status: "disconnected",
          configEncrypted: null,
          kmsKeyId: null,
          dekWrappedB64: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(integrations.orgId, org!.id), eq(integrations.provider, input.provider)));
      return { ok: true };
    }),

  /**
   * Live-test a saved integration by calling the adapter's `test()` method
   * (or, for e-sign providers, a registry / decrypt canary).
   *
   * Branching is by **catalog category**, not by provider-id prefix. The
   * earlier implementation branched on `provider.startsWith("esign_")`, but
   * the catalog uses bare provider ids (e.g. `emudhra`, not `esign_emudhra`)
   * to match `signature_requests.provider`, the eSign router lookup, and the
   * webhook receiver in `http/webhooks.ts`. The prefix branch was therefore
   * dead code and `testIntegration` for `emudhra` always fell through to
   * `getIntegrationAdapter("emudhra")` which is not registered, yielding a
   * spurious "no adapter" error from the admin UI.
   *
   * Source: market-assessment redo §C1 (2026-04-26).
   */
  testIntegration: permissionProcedure("settings", "write")
    .input(z.object({ provider: ProviderEnum }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const catalog = PROVIDER_CATALOG.find((c) => c.provider === input.provider);
      if (!catalog) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown provider: ${input.provider}` });
      }
      if (!catalog.testable) {
        return {
          ok: false,
          details: `Provider '${catalog.displayName}' does not support a live connection test.`,
        };
      }

      const [row] = await db
        .select({
          id: integrations.id,
          configEncrypted: integrations.configEncrypted,
        })
        .from(integrations)
        .where(and(eq(integrations.orgId, org!.id), eq(integrations.provider, input.provider)));
      if (!row || !row.configEncrypted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integration not configured. Save credentials first." });
      }

      const config = decryptIntegrationConfig(row.configEncrypted);

      if (catalog.category === "esign") {
        const provider = getEsignProvider(input.provider);
        if (!provider) {
          await db
            .update(integrations)
            .set({
              status: "error",
              lastError: `E-sign provider '${input.provider}' not registered`,
              updatedAt: new Date(),
            })
            .where(eq(integrations.id, row.id));
          return {
            ok: false,
            details: `E-sign provider '${input.provider}' is not registered in services/esign.`,
          };
        }
        const requiredKeys = catalog.fields.filter((f) => f.required).map((f) => f.key);
        const missing = requiredKeys.filter((k) => !(config as Record<string, string>)[k]?.trim());
        if (missing.length > 0) {
          await db
            .update(integrations)
            .set({ status: "error", lastError: `Missing required field(s): ${missing.join(", ")}`, updatedAt: new Date() })
            .where(eq(integrations.id, row.id));
          return { ok: false, details: `Missing required field(s): ${missing.join(", ")}` };
        }
        await db
          .update(integrations)
          .set({ status: "connected", lastError: null, updatedAt: new Date() })
          .where(eq(integrations.id, row.id));
        return {
          ok: true,
          details: `Provider '${provider.displayName}' is registered and credentials decrypt cleanly. A live envelope round-trip would consume a signer slot — skipped here. Use the eMudhra runbook (docs/EMUDHRA_PRODUCTION_RUNBOOK.md) for the dry-run.`,
        };
      }

      const adapter = getIntegrationAdapter(input.provider);
      if (!adapter) {
        await db
          .update(integrations)
          .set({
            status: "error",
            lastError: `No adapter registered for '${input.provider}'`,
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, row.id));
        return { ok: false, details: `No adapter registered for '${input.provider}'.` };
      }
      try {
        const res = await adapter.test(config as never);
        await db
          .update(integrations)
          .set({
            status: res.ok ? "connected" : "error",
            lastError: res.ok ? null : res.details ?? "Test failed",
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, row.id));
        return res;
      } catch (err) {
        const msg = (err as Error).message ?? "unknown error";
        await db
          .update(integrations)
          .set({ status: "error", lastError: msg, updatedAt: new Date() })
          .where(eq(integrations.id, row.id));
        return { ok: false, details: msg };
      }
    }),

  // ── Outgoing Webhooks ──────────────────────────────────────────────────
  listWebhooks: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.orgId, org!.id))
      .orderBy(desc(webhooks.createdAt));
  }),

  createWebhook: permissionProcedure("settings", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().url(),
        events: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const secret = crypto.randomBytes(32).toString("hex");
      const [webhook] = await db
        .insert(webhooks)
        .values({
          orgId: org!.id,
          name: input.name,
          url: input.url,
          events: input.events,
          secret,
          isActive: true,
        })
        .returning();
      return { ...webhook!, secretOnce: secret };
    }),

  updateWebhook: permissionProcedure("settings", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).min(1).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.url !== undefined) patch.url = input.url;
      if (input.events !== undefined) patch.events = input.events;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [updated] = await db
        .update(webhooks)
        .set(patch)
        .where(eq(webhooks.id, input.id))
        .returning();
      return updated;
    }),

  deleteWebhook: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .delete(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      return { ok: true };
    }),

  rerollWebhookSecret: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [existing] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const newSecret = crypto.randomBytes(32).toString("hex");
      await db
        .update(webhooks)
        .set({ secret: newSecret, updatedAt: new Date() })
        .where(eq(webhooks.id, input.id));
      return { secretOnce: newSecret };
    }),

  listDeliveries: permissionProcedure("settings", "read")
    .input(z.object({ webhookId: z.string().uuid(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // Verify org ownership
      const [hook] = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.orgId, org!.id)));
      if (!hook) throw new TRPCError({ code: "NOT_FOUND" });

      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(input.limit);
    }),

  // ── API Keys ───────────────────────────────────────────────────────────
  listApiKeys: permissionProcedure("settings", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    // Never return keyHash; return display-safe fields only
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        createdById: apiKeys.createdById,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, org!.id))
      .orderBy(desc(apiKeys.createdAt));
  }),

  createApiKey: permissionProcedure("settings", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        permissions: z.record(z.array(z.string())).default({}),
        expiresInDays: z.number().int().min(1).max(3650).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      // Generate nxk_<random32hex>
      const rawKey = "nxk_" + crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12); // "nxk_" + 8 chars

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null;

      const [created] = await db
        .insert(apiKeys)
        .values({
          orgId: org!.id,
          createdById: user!.id,
          name: input.name,
          keyHash,
          keyPrefix,
          permissions: input.permissions,
          expiresAt: expiresAt ?? undefined,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          permissions: apiKeys.permissions,
          expiresAt: apiKeys.expiresAt,
          createdAt: apiKeys.createdAt,
        });

      return { ...created!, keyOnce: rawKey };
    }),

  revokeApiKey: permissionProcedure("settings", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.orgId, org!.id)));
      return { ok: true };
    }),

  // ── Sync triggers ──────────────────────────────────────────────────────
  triggerJiraSync: permissionProcedure("settings", "write")
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [integration] = await db
        .select({ id: integrations.id, provider: integrations.provider })
        .from(integrations)
        .where(and(eq(integrations.id, input.integrationId), eq(integrations.orgId, org!.id)));

      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
      if (integration.provider !== "jira") throw new TRPCError({ code: "BAD_REQUEST", message: "Integration is not a Jira integration" });

      try {
        const synced = await syncJiraToNexus(db, org!.id, input.integrationId);
        return { ok: true, synced };
      } catch (err) {
        await db
          .update(integrations)
          .set({ lastError: (err as Error).message, updatedAt: new Date() })
          .where(eq(integrations.id, input.integrationId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  triggerSapSync: permissionProcedure("settings", "write")
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [integration] = await db
        .select({ id: integrations.id, provider: integrations.provider })
        .from(integrations)
        .where(and(eq(integrations.id, input.integrationId), eq(integrations.orgId, org!.id)));

      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
      if (integration.provider !== "sap") throw new TRPCError({ code: "BAD_REQUEST", message: "Integration is not a SAP integration" });

      try {
        const synced = await syncSapToNexus(db, org!.id, input.integrationId);
        return { ok: true, synced };
      } catch (err) {
        await db
          .update(integrations)
          .set({ lastError: (err as Error).message, updatedAt: new Date() })
          .where(eq(integrations.id, input.integrationId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  /**
   * US-ITSM-009 — ServiceNow migration spoke: classify export rows without persisting (idempotency / field checks).
   */
  serviceNowImportDryRun: permissionProcedure("settings", "read")
    .input(
      z.object({
        entity: z.enum(["incident", "change", "ci", "kb"]),
        rows: z.array(z.record(z.unknown())).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      const errors: Array<{ index: number; message: string }> = [];
      const seen = new Set<string>();
      let wouldCreate = 0;
      let wouldUpdate = 0;
      let skipped = 0;
      const stableKey = (r: Record<string, unknown>) =>
        String(r["sys_id"] ?? r["number"] ?? r["u_number"] ?? r["task_number"] ?? "");
      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i] as Record<string, unknown>;
        const k = stableKey(row);
        if (!k) {
          errors.push({ index: i, message: "Missing stable key (sys_id / number)" });
          skipped++;
          continue;
        }
        if (seen.has(k)) {
          skipped++;
          continue;
        }
        seen.add(k);
        if (row["__coheronconnect_existing"] === true) wouldUpdate++;
        else wouldCreate++;
      }
      return {
        entity: input.entity,
        wouldCreate,
        wouldUpdate,
        skipped,
        duplicateOrInvalid: skipped,
        errorSample: errors.slice(0, 25),
        note: "Dry-run only — no database writes. Set __coheronconnect_existing on rows that map to existing CoheronConnect records.",
      };
    }),
});
