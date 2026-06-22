import {
  decimal,
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
import { organizations, users } from "./auth";

// ── Enums ─────────────────────────────────────────────────────────────────
export const reviewStatusEnum = pgEnum("review_status", [
  "draft",
  "self_review",
  "peer_review",
  "manager_review",
  "calibration",
  "completed",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "draft",
  "active",
  "at_risk",
  "completed",
  "cancelled",
]);

export const ratingScaleEnum = pgEnum("rating_scale", [
  "1", "2", "3", "4", "5",
]);

// ── Review Cycles ──────────────────────────────────────────────────────────
export const reviewCycles = pgTable(
  "review_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("annual"),     // annual | mid_year | quarterly | probation
    status: text("status").notNull().default("draft"),  // draft | active | calibration | completed
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    selfReviewDeadline: timestamp("self_review_deadline", { withTimezone: true }),
    peerReviewDeadline: timestamp("peer_review_deadline", { withTimezone: true }),
    managerReviewDeadline: timestamp("manager_review_deadline", { withTimezone: true }),
    enable360: text("enable_360").default("false"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("review_cycles_org_idx").on(t.orgId),
    statusIdx: index("review_cycles_status_idx").on(t.orgId, t.status),
  }),
);

// ── Performance Reviews ────────────────────────────────────────────────────
export const performanceReviews = pgTable(
  "performance_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => reviewCycles.id, { onDelete: "cascade" }),
    revieweeId: uuid("reviewee_id").notNull().references(() => users.id),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    reviewerRole: text("reviewer_role").notNull().default("manager"), // self | peer | manager
    status: reviewStatusEnum("status").notNull().default("draft"),
    overallRating: ratingScaleEnum("overall_rating"),
    selfRating: ratingScaleEnum("self_rating"),
    strengthsText: text("strengths_text"),
    areasForGrowthText: text("areas_for_growth_text"),
    managerComments: text("manager_comments"),
    goalsAchieved: integer("goals_achieved").default(0),
    goalsTotal: integer("goals_total").default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("performance_reviews_org_idx").on(t.orgId),
    cycleIdx: index("performance_reviews_cycle_idx").on(t.cycleId),
    revieweeIdx: index("performance_reviews_reviewee_idx").on(t.orgId, t.revieweeId),
  }),
);

// ── Goals / OKRs ───────────────────────────────────────────────────────────
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").references(() => reviewCycles.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    parentGoalId: uuid("parent_goal_id"),    // for cascaded org/team OKRs
    title: text("title").notNull(),
    description: text("description"),
    goalType: text("goal_type").notNull().default("individual"), // individual | team | org
    status: goalStatusEnum("status").notNull().default("draft"),
    progress: integer("progress").notNull().default(0),          // 0–100
    targetValue: decimal("target_value", { precision: 14, scale: 2 }),
    currentValue: decimal("current_value", { precision: 14, scale: 2 }),
    unit: text("unit"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    tags: jsonb("tags").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("goals_org_idx").on(t.orgId),
    ownerIdx: index("goals_owner_idx").on(t.orgId, t.ownerId),
    cycleIdx: index("goals_cycle_idx").on(t.cycleId),
    statusIdx: index("goals_status_idx").on(t.orgId, t.status),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const reviewCyclesRelations = relations(reviewCycles, ({ one, many }) => ({
  org: one(organizations, { fields: [reviewCycles.orgId], references: [organizations.id] }),
  createdBy: one(users, { fields: [reviewCycles.createdById], references: [users.id] }),
  reviews: many(performanceReviews),
  goals: many(goals),
}));

export const performanceReviewsRelations = relations(performanceReviews, ({ one }) => ({
  org: one(organizations, { fields: [performanceReviews.orgId], references: [organizations.id] }),
  cycle: one(reviewCycles, { fields: [performanceReviews.cycleId], references: [reviewCycles.id] }),
  reviewee: one(users, { fields: [performanceReviews.revieweeId], references: [users.id] }),
  reviewer: one(users, { fields: [performanceReviews.reviewerId], references: [users.id] }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  org: one(organizations, { fields: [goals.orgId], references: [organizations.id] }),
  cycle: one(reviewCycles, { fields: [goals.cycleId], references: [reviewCycles.id] }),
  owner: one(users, { fields: [goals.ownerId], references: [users.id] }),
}));
