import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const walkupVisitStatusEnum = pgEnum("walkup_visit_status", [
  "waiting",
  "in_service",
  "completed",
  "no_show",
]);

export const walkupApptStatusEnum = pgEnum("walkup_appt_status", [
  "booked",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

// ── Walk-Up Visits ─────────────────────────────────────────────────────────
export const walkupVisits = pgTable(
  "walkup_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id").notNull().references(() => users.id),
    locationId: uuid("location_id"),
    issueCategory: text("issue_category"),
    queuePosition: integer("queue_position"),
    status: walkupVisitStatusEnum("status").notNull().default("waiting"),
    agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    csatScore: integer("csat_score"),
    waitTimeMinutes: integer("wait_time_minutes"),
    serviceTimeMinutes: integer("service_time_minutes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("walkup_visits_org_idx").on(t.orgId),
    statusIdx: index("walkup_visits_status_idx").on(t.orgId, t.status),
    createdAtIdx: index("walkup_visits_created_at_idx").on(t.createdAt),
  }),
);

// ── Walk-Up Appointments ───────────────────────────────────────────────────
export const walkupAppointments = pgTable(
  "walkup_appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    locationId: uuid("location_id"),
    agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: walkupApptStatusEnum("status").notNull().default("booked"),
    issueCategory: text("issue_category"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("walkup_appts_org_idx").on(t.orgId),
    scheduledIdx: index("walkup_appts_scheduled_idx").on(t.scheduledAt),
  }),
);

export const walkupVisitsRelations = relations(walkupVisits, ({ one }) => ({
  org: one(organizations, { fields: [walkupVisits.orgId], references: [organizations.id] }),
  visitor: one(users, { fields: [walkupVisits.visitorId], references: [users.id], relationName: "wv_visitor" }),
  agent: one(users, { fields: [walkupVisits.agentId], references: [users.id], relationName: "wv_agent" }),
}));
