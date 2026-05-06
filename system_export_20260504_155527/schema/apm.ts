import {
  decimal,
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

export const appLifecycleEnum = pgEnum("app_lifecycle", [
  "evaluating",
  "investing",
  "sustaining",
  "harvesting",
  "retiring",
  "obsolete",
]);

export const cloudReadinessEnum = pgEnum("cloud_readiness", [
  "cloud_native",
  "lift_shift",
  "replatform",
  "rearchitect",
  "retire",
  "not_assessed",
]);

// ── Applications ───────────────────────────────────────────────────────────
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    lifecycle: appLifecycleEnum("lifecycle").notNull().default("sustaining"),
    healthScore: integer("health_score").default(70),
    annualCost: decimal("annual_cost", { precision: 14, scale: 2 }),
    usersCount: integer("users_count").default(0),
    cloudReadiness: cloudReadinessEnum("cloud_readiness").notNull().default("not_assessed"),
    techDebtScore: integer("tech_debt_score").default(0),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    department: text("department"),
    vendor: text("vendor"),
    version: text("version"),
    lastReviewDate: timestamp("last_review_date", { withTimezone: true }),
    retirementDate: timestamp("retirement_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("applications_org_idx").on(t.orgId),
    lifecycleIdx: index("applications_lifecycle_idx").on(t.orgId, t.lifecycle),
  }),
);

export const applicationsRelations = relations(applications, ({ one }) => ({
  org: one(organizations, { fields: [applications.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [applications.ownerId], references: [users.id] }),
}));
