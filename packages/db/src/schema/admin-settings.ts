import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

/**
 * Admin-configurable settings: SLA definitions, system properties, and
 * notification rules. These back the Admin → Settings screens that were
 * previously stubbed in the API. All org-scoped (multi-tenant).
 */

// ── SLA definitions ─────────────────────────────────────────────────────────
// Response/resolution targets per priority, used by ticketing/CSM SLA timers.
export const slaDefinitions = pgTable(
  "sla_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priority: text("priority").notNull(), // low | medium | high | critical
    responseMinutes: integer("response_minutes").notNull(),
    resolveMinutes: integer("resolve_minutes").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("sla_definitions_org_idx").on(t.orgId),
    orgPriorityIdx: uniqueIndex("sla_definitions_org_priority_idx").on(t.orgId, t.priority),
  }),
);

export const slaDefinitionsRelations = relations(slaDefinitions, ({ one }) => ({
  org: one(organizations, { fields: [slaDefinitions.orgId], references: [organizations.id] }),
}));

// ── System properties ───────────────────────────────────────────────────────
// Key/value platform configuration editable by admins (e.g. session timeout).
export const systemProperties = pgTable(
  "system_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    description: text("description"),
    environment: text("environment").notNull().default("all"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("system_properties_org_idx").on(t.orgId),
    orgKeyIdx: uniqueIndex("system_properties_org_key_idx").on(t.orgId, t.key),
  }),
);

export const systemPropertiesRelations = relations(systemProperties, ({ one }) => ({
  org: one(organizations, { fields: [systemProperties.orgId], references: [organizations.id] }),
}));

// ── Notification rules ───────────────────────────────────────────────────────
// "When <event> fires, notify <recipients> via <channel>" admin automation.
export const notificationRules = pgTable(
  "notification_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull(), // email | slack | teams | in_app
    recipients: text("recipients").notNull(),
    conditions: text("conditions"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("notification_rules_org_idx").on(t.orgId),
    orgActiveIdx: index("notification_rules_org_active_idx").on(t.orgId, t.active),
  }),
);

export const notificationRulesRelations = relations(notificationRules, ({ one }) => ({
  org: one(organizations, { fields: [notificationRules.orgId], references: [organizations.id] }),
  creator: one(users, { fields: [notificationRules.createdBy], references: [users.id] }),
}));
