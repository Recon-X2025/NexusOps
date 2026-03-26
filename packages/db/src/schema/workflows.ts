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
import { organizations, users } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────
export const workflowTriggerTypeEnum = pgEnum("workflow_trigger_type", [
  "ticket_created",
  "ticket_updated",
  "status_changed",
  "scheduled",
  "manual",
  "webhook",
]);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "running",
  "completed",
  "failed",
  "cancelled",
  "waiting",
]);

export const workflowStepStatusEnum = pgEnum("workflow_step_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting",
]);

// ── Workflows ──────────────────────────────────────────────────────────────
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: workflowTriggerTypeEnum("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(false),
    currentVersion: integer("current_version").notNull().default(0),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("workflows_org_idx").on(t.orgId),
    activeIdx: index("workflows_active_idx").on(t.orgId, t.isActive),
  }),
);

// ── Workflow Versions ──────────────────────────────────────────────────────
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    nodes: jsonb("nodes")
      .$type<Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      }>>()
      .notNull()
      .default([]),
    edges: jsonb("edges")
      .$type<Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
        label?: string;
      }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workflowVersionIdx: index("workflow_versions_workflow_idx").on(t.workflowId, t.version),
  }),
);

// ── Workflow Runs ──────────────────────────────────────────────────────────
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id),
    temporalWorkflowId: text("temporal_workflow_id"),
    status: workflowRunStatusEnum("status").notNull().default("running"),
    triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    workflowIdx: index("workflow_runs_workflow_idx").on(t.workflowId),
    statusIdx: index("workflow_runs_status_idx").on(t.status),
    startedAtIdx: index("workflow_runs_started_at_idx").on(t.startedAt),
  }),
);

// ── Workflow Step Runs ─────────────────────────────────────────────────────
export const workflowStepRuns = pgTable(
  "workflow_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: workflowStepStatusEnum("status").notNull().default("pending"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => ({
    runIdx: index("workflow_step_runs_run_idx").on(t.runId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  org: one(organizations, { fields: [workflows.orgId], references: [organizations.id] }),
  createdBy: one(users, { fields: [workflows.createdById], references: [users.id] }),
  versions: many(workflowVersions),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowRuns.workflowId], references: [workflows.id] }),
  version: one(workflowVersions, { fields: [workflowRuns.workflowVersionId], references: [workflowVersions.id] }),
  stepRuns: many(workflowStepRuns),
}));
