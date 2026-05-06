import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const rotationTypeEnum = pgEnum("rotation_type", ["daily", "weekly", "custom"]);

// ── On-Call Schedules ──────────────────────────────────────────────────────
export const oncallSchedules = pgTable(
  "oncall_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    team: text("team"),
    rotationType: rotationTypeEnum("rotation_type").notNull().default("weekly"),
    members: jsonb("members").$type<Array<{ userId: string; name: string; phone: string; email: string }>>().default([]),
    overrides: jsonb("overrides").$type<Array<{ userId: string; start: string; end: string; reason: string }>>().default([]),
    escalationChain: jsonb("escalation_chain").$type<Array<{ level: number; userId: string; delayMinutes: number }>>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("oncall_schedules_org_idx").on(t.orgId) }),
);

// ── On-Call Overrides ──────────────────────────────────────────────────────
export const oncallOverrides = pgTable(
  "oncall_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id").notNull().references(() => oncallSchedules.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ scheduleIdx: index("oncall_overrides_schedule_idx").on(t.scheduleId) }),
);

export const oncallSchedulesRelations = relations(oncallSchedules, ({ one, many }) => ({
  org: one(organizations, { fields: [oncallSchedules.orgId], references: [organizations.id] }),
  overrides: many(oncallOverrides),
}));
