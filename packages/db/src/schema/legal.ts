import {
  boolean,
  decimal,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const legalMatterTypeEnum = pgEnum("legal_matter_type", [
  "litigation",
  "employment",
  "ip",
  "regulatory",
  "ma",
  "data_privacy",
  "corporate",
  "commercial",
]);

export const legalMatterStatusEnum = pgEnum("legal_matter_status", [
  "intake",
  "active",
  "discovery",
  "pre_trial",
  "trial",
  "closed",
  "settled",
]);

export const legalRequestStatusEnum = pgEnum("legal_request_status", [
  "new",
  "assigned",
  "in_progress",
  "completed",
  "rejected",
]);

export const investigationTypeEnum = pgEnum("investigation_type", [
  "ethics",
  "harassment",
  "fraud",
  "data_breach",
  "whistleblower",
  "discrimination",
]);

export const investigationStatusEnum = pgEnum("investigation_status", [
  "reported",
  "under_investigation",
  "findings",
  "closed",
]);

// ── Legal Matters ──────────────────────────────────────────────────────────
export const legalMatters = pgTable(
  "legal_matters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    matterNumber: text("matter_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    type: legalMatterTypeEnum("type").notNull().default("commercial"),
    status: legalMatterStatusEnum("status").notNull().default("intake"),
    phase: text("phase"),
    confidential: boolean("confidential").notNull().default(false),
    estimatedCost: decimal("estimated_cost", { precision: 14, scale: 2 }),
    actualCost: decimal("actual_cost", { precision: 14, scale: 2 }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    externalCounsel: text("external_counsel"),
    jurisdiction: text("jurisdiction"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("legal_matters_org_number_idx").on(t.orgId, t.matterNumber),
    orgIdx: index("legal_matters_org_idx").on(t.orgId),
    statusIdx: index("legal_matters_status_idx").on(t.orgId, t.status),
  }),
);

// ── Legal Requests ─────────────────────────────────────────────────────────
export const legalRequests = pgTable(
  "legal_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type"),
    priority: text("priority").notNull().default("medium"),
    status: legalRequestStatusEnum("status").notNull().default("new"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    linkedMatterId: uuid("linked_matter_id").references(() => legalMatters.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("legal_requests_org_idx").on(t.orgId),
    statusIdx: index("legal_requests_status_idx").on(t.orgId, t.status),
  }),
);

// ── Investigations ─────────────────────────────────────────────────────────
export const investigations = pgTable(
  "investigations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: investigationTypeEnum("type").notNull().default("ethics"),
    status: investigationStatusEnum("status").notNull().default("reported"),
    confidential: boolean("confidential").notNull().default(true),
    anonymousReport: boolean("anonymous_report").notNull().default(false),
    investigatorId: uuid("investigator_id").references(() => users.id, { onDelete: "set null" }),
    findings: text("findings"),
    recommendation: text("recommendation"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("investigations_org_idx").on(t.orgId),
    statusIdx: index("investigations_status_idx").on(t.orgId, t.status),
  }),
);

export const legalMattersRelations = relations(legalMatters, ({ one }) => ({
  org: one(organizations, { fields: [legalMatters.orgId], references: [organizations.id] }),
  assignedTo: one(users, { fields: [legalMatters.assignedTo], references: [users.id] }),
}));
