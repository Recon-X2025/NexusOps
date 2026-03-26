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

export const riskCategoryEnum = pgEnum("risk_category", [
  "operational",
  "financial",
  "strategic",
  "compliance",
  "technology",
  "reputational",
]);

export const riskStatusEnum = pgEnum("risk_status", [
  "identified",
  "assessed",
  "mitigating",
  "accepted",
  "closed",
]);

export const riskTreatmentEnum = pgEnum("risk_treatment", [
  "accept",
  "mitigate",
  "transfer",
  "avoid",
]);

export const policyStatusEnum = pgEnum("policy_status", [
  "draft",
  "review",
  "approved",
  "published",
  "retired",
]);

export const auditPlanStatusEnum = pgEnum("audit_plan_status", [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const vendorTierEnum = pgEnum("vendor_tier", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "not_sent",
  "pending",
  "completed",
  "expired",
]);

// ── Risks ──────────────────────────────────────────────────────────────────
export const risks = pgTable(
  "risks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: riskCategoryEnum("category").notNull().default("operational"),
    likelihood: integer("likelihood").notNull().default(3),
    impact: integer("impact").notNull().default(3),
    riskScore: integer("risk_score").notNull().default(9),
    status: riskStatusEnum("status").notNull().default("identified"),
    treatment: riskTreatmentEnum("treatment"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    controls: jsonb("controls").$type<Array<{ id: string; title: string; status: string }>>().default([]),
    mitigationPlan: text("mitigation_plan"),
    residualLikelihood: integer("residual_likelihood"),
    residualImpact: integer("residual_impact"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("risks_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("risks_org_idx").on(t.orgId),
    statusIdx: index("risks_status_idx").on(t.orgId, t.status),
  }),
);

// ── Policies ───────────────────────────────────────────────────────────────
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    category: text("category"),
    version: integer("version").notNull().default(1),
    status: policyStatusEnum("status").notNull().default("draft"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewCycleMonths: integer("review_cycle_months").default(12),
    lastReviewed: timestamp("last_reviewed", { withTimezone: true }),
    nextReview: timestamp("next_review", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("policies_org_idx").on(t.orgId),
    statusIdx: index("policies_status_idx").on(t.orgId, t.status),
  }),
);

// ── Audit Plans ────────────────────────────────────────────────────────────
export const auditPlans = pgTable(
  "audit_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scope: text("scope"),
    status: auditPlanStatusEnum("status").notNull().default("planned"),
    auditorId: uuid("auditor_id").references(() => users.id, { onDelete: "set null" }),
    findings: jsonb("findings").$type<Array<{ id: string; title: string; severity: string; status: string }>>().default([]),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("audit_plans_org_idx").on(t.orgId) }),
);

// ── Vendor Risks ───────────────────────────────────────────────────────────
export const vendorRisks = pgTable(
  "vendor_risks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    vendorName: text("vendor_name").notNull(),
    tier: vendorTierEnum("tier").notNull().default("medium"),
    riskScore: integer("risk_score").default(0),
    questionnaireStatus: questionnaireStatusEnum("questionnaire_status").notNull().default("not_sent"),
    lastAssessed: timestamp("last_assessed", { withTimezone: true }),
    nextAssessment: timestamp("next_assessment", { withTimezone: true }),
    findings: jsonb("findings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("vendor_risks_org_idx").on(t.orgId) }),
);

export const risksRelations = relations(risks, ({ one }) => ({
  org: one(organizations, { fields: [risks.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [risks.ownerId], references: [users.id] }),
}));
