import {
  decimal,
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

export const projectStatusEnum = pgEnum("project_status", [
  "proposed",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const projectHealthEnum = pgEnum("project_health", ["green", "amber", "red"]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "upcoming",
  "in_progress",
  "completed",
  "missed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

// ── Strategic initiatives (US-STR-004) ─────────────────────────────────────
export const strategicInitiatives = pgTable(
  "strategic_initiatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    theme: text("theme"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("strategic_initiatives_org_idx").on(t.orgId),
  }),
);

// ── Projects ───────────────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("planning"),
    phase: text("phase"),
    health: projectHealthEnum("health").notNull().default("green"),
    budgetTotal: decimal("budget_total", { precision: 14, scale: 2 }),
    budgetSpent: decimal("budget_spent", { precision: 14, scale: 2 }).default("0"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    department: text("department"),
    tags: text("tags").array().default([]),
    initiativeId: uuid("initiative_id").references(() => strategicInitiatives.id, {
      onDelete: "set null",
    }),
    benefitType: text("benefit_type"),
    benefitTarget: decimal("benefit_target", { precision: 14, scale: 2 }),
    benefitActual: decimal("benefit_actual", { precision: 14, scale: 2 }),
    linkedApplicationIds: jsonb("linked_application_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("projects_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("projects_org_idx").on(t.orgId),
    statusIdx: index("projects_status_idx").on(t.orgId, t.status),
    initiativeIdx: index("projects_initiative_idx").on(t.initiativeId),
  }),
);

// ── Project dependencies (US-STR-007) ─────────────────────────────────────
export const projectDependencies = pgTable(
  "project_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fromProjectId: uuid("from_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    toProjectId: uuid("to_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dependencyType: text("dependency_type").notNull().default("finish_to_start"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("project_dependencies_org_idx").on(t.orgId),
    fromIdx: index("project_dependencies_from_idx").on(t.fromProjectId),
    toIdx: index("project_dependencies_to_idx").on(t.toProjectId),
    uniqPair: uniqueIndex("project_dependencies_pair_uidx").on(t.fromProjectId, t.toProjectId),
  }),
);

// ── Project Milestones ─────────────────────────────────────────────────────
export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: milestoneStatusEnum("status").notNull().default("upcoming"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ projectIdx: index("project_milestones_project_idx").on(t.projectId) }),
);

// ── Project Tasks ──────────────────────────────────────────────────────────
export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => projectMilestones.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: taskStatusEnum("status").notNull().default("backlog"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    storyPoints: integer("story_points"),
    sprint: text("sprint"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_tasks_project_idx").on(t.projectId),
    statusIdx: index("project_tasks_status_idx").on(t.projectId, t.status),
    assigneeIdx: index("project_tasks_assignee_idx").on(t.assigneeId),
  }),
);

export const strategicInitiativesRelations = relations(strategicInitiatives, ({ one, many }) => ({
  org: one(organizations, { fields: [strategicInitiatives.orgId], references: [organizations.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  initiative: one(strategicInitiatives, { fields: [projects.initiativeId], references: [strategicInitiatives.id] }),
  milestones: many(projectMilestones),
  tasks: many(projectTasks),
}));

export const projectDependenciesRelations = relations(projectDependencies, ({ one }) => ({
  org: one(organizations, { fields: [projectDependencies.orgId], references: [organizations.id] }),
  fromProject: one(projects, {
    fields: [projectDependencies.fromProjectId],
    references: [projects.id],
    relationName: "project_dep_from",
  }),
  toProject: one(projects, {
    fields: [projectDependencies.toProjectId],
    references: [projects.id],
    relationName: "project_dep_to",
  }),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one, many }) => ({
  project: one(projects, { fields: [projectMilestones.projectId], references: [projects.id] }),
  tasks: many(projectTasks),
}));
