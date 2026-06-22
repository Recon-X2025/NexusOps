import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

/** Supported record types for rule evaluation (extend over time). */
export type BusinessRuleEntityType = "ticket";

/**
 * Org-scoped automation: when `events` fire on `entity_type`, if all `conditions`
 * match, run `actions` in order. Stored JSON validated by API (versioned DSL).
 */
export const businessRules = pgTable(
  "business_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    entityType: text("entity_type").notNull(),
    /** e.g. ["created","updated"] */
    events: jsonb("events").$type<string[]>().notNull().default([]),
    /** Condition DSL — see business-rules-engine in API */
    conditions: jsonb("conditions").$type<unknown[]>().notNull().default([]),
    /** Action DSL */
    actions: jsonb("actions").$type<unknown[]>().notNull().default([]),
    /** Lower runs first when multiple rules match */
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("business_rules_org_idx").on(t.orgId),
    orgEnabledIdx: index("business_rules_org_enabled_idx").on(t.orgId, t.enabled),
  }),
);

export const businessRulesRelations = relations(businessRules, ({ one }) => ({
  org: one(organizations, { fields: [businessRules.orgId], references: [organizations.id] }),
  creator: one(users, { fields: [businessRules.createdBy], references: [users.id] }),
}));
