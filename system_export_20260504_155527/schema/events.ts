import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { tickets } from "./tickets";

// ── Enums ──────────────────────────────────────────────────────────────────
export const eventSeverityEnum = pgEnum("event_severity", [
  "critical",
  "major",
  "minor",
  "warning",
  "info",
  "clear",
]);

export const eventStateEnum = pgEnum("event_state", [
  "open",
  "in_progress",
  "resolved",
  "suppressed",
  "flapping",
]);

// ── Events ─────────────────────────────────────────────────────────────────
export const itomEvents = pgTable(
  "itom_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    node: text("node").notNull(),
    metric: text("metric").notNull(),
    value: text("value"),
    threshold: text("threshold"),
    severity: eventSeverityEnum("severity").notNull().default("info"),
    state: eventStateEnum("state").notNull().default("open"),
    source: text("source").notNull().default("monitoring"),
    count: integer("count").notNull().default(1),
    aiRootCause: text("ai_root_cause"),
    linkedIncidentId: uuid("linked_incident_id").references(() => tickets.id, { onDelete: "set null" }),
    firstOccurrence: timestamp("first_occurrence", { withTimezone: true }).notNull().defaultNow(),
    lastOccurrence: timestamp("last_occurrence", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("itom_events_org_idx").on(t.orgId),
    nodeIdx: index("itom_events_node_idx").on(t.node),
    severityIdx: index("itom_events_severity_idx").on(t.severity),
    stateIdx: index("itom_events_state_idx").on(t.state),
  }),
);

// ── Suppression Rules ──────────────────────────────────────────────────────
export const itomSuppressionRules = pgTable(
  "itom_suppression_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    condition: text("condition").notNull(), // e.g. "node=db-01 AND metric=cpu_load"
    suppressUntil: timestamp("suppress_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("itom_suppression_rules_org_idx").on(t.orgId),
  }),
);

// ── Correlation Policies ───────────────────────────────────────────────────
export const itomCorrelationPolicies = pgTable(
  "itom_correlation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    condition: text("condition").notNull(), // e.g. "count > 10 AND severity = critical"
    action: text("action").notNull(), // e.g. "create_incident" or "suppress"
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("itom_correlation_policies_org_idx").on(t.orgId),
  }),
);
