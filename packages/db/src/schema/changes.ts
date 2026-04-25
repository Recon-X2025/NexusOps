import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const changeTypeEnum = pgEnum("change_type", [
  "normal",
  "standard",
  "emergency",
  "expedited",
]);

export const changeRiskEnum = pgEnum("change_risk", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const changeStatusEnum = pgEnum("change_status", [
  "draft",
  "submitted",
  "cab_review",
  "approved",
  "scheduled",
  "implementing",
  "completed",
  "failed",
  "cancelled",
]);

export const changeApprovalDecisionEnum = pgEnum("change_approval_decision", [
  "pending",
  "approved",
  "rejected",
]);

export const problemStatusEnum = pgEnum("problem_status", [
  "new",
  "investigation",
  "root_cause_identified",
  "known_error",
  "resolved",
  "closed",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "planning",
  "build",
  "test",
  "deploy",
  "completed",
  "cancelled",
]);

// ── Change Requests ────────────────────────────────────────────────────────
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    type: changeTypeEnum("type").notNull().default("normal"),
    risk: changeRiskEnum("risk").notNull().default("medium"),
    status: changeStatusEnum("status").notNull().default("draft"),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    cabDecision: text("cab_decision"),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    rollbackPlan: text("rollback_plan"),
    implementationPlan: text("implementation_plan"),
    testPlan: text("test_plan"),
    affectedCis: jsonb("affected_cis").$type<string[]>().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("change_requests_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("change_requests_org_idx").on(t.orgId),
    statusIdx: index("change_requests_status_idx").on(t.orgId, t.status),
    createdAtIdx: index("change_requests_created_at_idx").on(t.createdAt),
  }),
);

// ── Change Approvals ───────────────────────────────────────────────────────
export const changeApprovals = pgTable(
  "change_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changeId: uuid("change_id").notNull().references(() => changeRequests.id, { onDelete: "cascade" }),
    approverId: uuid("approver_id").notNull().references(() => users.id),
    decision: changeApprovalDecisionEnum("decision").notNull().default("pending"),
    comments: text("comments"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    changeIdx: index("change_approvals_change_idx").on(t.changeId),
  }),
);

// ── Problems ───────────────────────────────────────────────────────────────
export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: problemStatusEnum("status").notNull().default("new"),
    priority: text("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    rootCause: text("root_cause"),
    workaround: text("workaround"),
    resolution: text("resolution"),
    notes: jsonb("notes").$type<Array<{ body: string; authorId: string; createdAt: string }>>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("problems_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("problems_org_idx").on(t.orgId),
  }),
);

// ── Known Errors ───────────────────────────────────────────────────────────
export const knownErrors = pgTable(
  "known_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id").references(() => problems.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    workaround: text("workaround"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("known_errors_org_idx").on(t.orgId) }),
);

// ── Change blackout windows (Phase B4 — read-only risk / CAB visibility) ───
export const changeBlackoutWindows = pgTable(
  "change_blackout_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("change_blackout_windows_org_idx").on(t.orgId),
  }),
);

// ── Releases ───────────────────────────────────────────────────────────────
export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull(),
    status: releaseStatusEnum("status").notNull().default("planning"),
    plannedDate: timestamp("planned_date", { withTimezone: true }),
    actualDate: timestamp("actual_date", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("releases_org_idx").on(t.orgId) }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const changeRequestsRelations = relations(changeRequests, ({ one, many }) => ({
  org: one(organizations, { fields: [changeRequests.orgId], references: [organizations.id] }),
  requester: one(users, { fields: [changeRequests.requesterId], references: [users.id], relationName: "cr_requester" }),
  assignee: one(users, { fields: [changeRequests.assigneeId], references: [users.id], relationName: "cr_assignee" }),
  approvals: many(changeApprovals),
}));
