import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────
export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "error",
  "pending",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
  "retrying",
]);

// ── Integrations ───────────────────────────────────────────────────────────
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // slack | teams | email | jira | sap
    status: integrationStatusEnum("status").notNull().default("disconnected"),
    configEncrypted: text("config_encrypted"), // AES-256 encrypted JSON
    kmsKeyId: text("kms_key_id"),
    dekWrappedB64: text("dek_wrapped_b64"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgProviderIdx: index("integrations_org_provider_idx").on(t.orgId, t.provider),
  }),
);

// ── Integration Sync Log ───────────────────────────────────────────────────
export const integrationSyncLogs = pgTable(
  "integration_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // inbound | outbound
    entityType: text("entity_type").notNull(),
    recordCount: integer("record_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errors: jsonb("errors").$type<Array<{ message: string; data?: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    integrationIdx: index("integration_sync_logs_integration_idx").on(t.integrationId),
    createdAtIdx: index("integration_sync_logs_created_at_idx").on(t.createdAt),
  }),
);

// ── Webhooks ───────────────────────────────────────────────────────────────
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: text("events").array().notNull().default([]), // ticket.created, ticket.updated, etc.
    secret: text("secret").notNull(), // HMAC-SHA256 signing secret
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("webhooks_org_idx").on(t.orgId),
  }),
);

// ── Webhook Deliveries ─────────────────────────────────────────────────────
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    statusCode: integer("status_code"),
    response: text("response"),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    webhookIdx: index("webhook_deliveries_webhook_idx").on(t.webhookId),
    statusIdx: index("webhook_deliveries_status_idx").on(t.status),
    nextRetryIdx: index("webhook_deliveries_next_retry_idx").on(t.nextRetryAt),
  }),
);

// ── AI Usage Log ───────────────────────────────────────────────────────────
export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(), // classification | search | suggestion | kb_chat | embedding
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("ai_usage_logs_org_idx").on(t.orgId),
    createdAtIdx: index("ai_usage_logs_created_at_idx").on(t.createdAt),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  org: one(organizations, { fields: [integrations.orgId], references: [organizations.id] }),
  syncLogs: many(integrationSyncLogs),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  org: one(organizations, { fields: [webhooks.orgId], references: [organizations.id] }),
  deliveries: many(webhookDeliveries),
}));
