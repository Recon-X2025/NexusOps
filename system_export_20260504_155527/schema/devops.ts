import {
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

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "running",
  "success",
  "failed",
  "cancelled",
]);

export const deploymentEnvEnum = pgEnum("deployment_env", [
  "dev",
  "qa",
  "staging",
  "uat",
  "production",
]);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "in_progress",
  "success",
  "failed",
  "rolled_back",
]);

// ── Pipeline Runs ──────────────────────────────────────────────────────────
export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pipelineName: text("pipeline_name").notNull(),
    trigger: text("trigger"),
    branch: text("branch"),
    commitSha: text("commit_sha"),
    status: pipelineStatusEnum("status").notNull().default("running"),
    stages: jsonb("stages").$type<Array<{ name: string; status: string; durationSeconds: number; steps: Array<{ name: string; status: string }> }>>().default([]),
    durationSeconds: integer("duration_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("pipeline_runs_org_idx").on(t.orgId),
    statusIdx: index("pipeline_runs_status_idx").on(t.orgId, t.status),
    startedAtIdx: index("pipeline_runs_started_at_idx").on(t.startedAt),
  }),
);

// ── Deployments ────────────────────────────────────────────────────────────
export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pipelineRunId: uuid("pipeline_run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
    appName: text("app_name").notNull(),
    environment: deploymentEnvEnum("environment").notNull().default("dev"),
    version: text("version").notNull(),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    deployedById: uuid("deployed_by_id").references(() => users.id, { onDelete: "set null" }),
    changeId: uuid("change_id"),
    durationSeconds: integer("duration_seconds"),
    rollbackVersion: text("rollback_version"),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("deployments_org_idx").on(t.orgId),
    envIdx: index("deployments_env_idx").on(t.orgId, t.environment),
    statusIdx: index("deployments_status_idx").on(t.status),
    startedAtIdx: index("deployments_started_at_idx").on(t.startedAt),
  }),
);

export const pipelineRunsRelations = relations(pipelineRuns, ({ one, many }) => ({
  org: one(organizations, { fields: [pipelineRuns.orgId], references: [organizations.id] }),
  deployments: many(deployments),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  org: one(organizations, { fields: [deployments.orgId], references: [organizations.id] }),
  pipelineRun: one(pipelineRuns, { fields: [deployments.pipelineRunId], references: [pipelineRuns.id] }),
  deployedBy: one(users, { fields: [deployments.deployedById], references: [users.id] }),
}));
