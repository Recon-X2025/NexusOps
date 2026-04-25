import {
  boolean,
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
  "hr",
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

export const riskRatingEnum = pgEnum("risk_rating", ["low", "medium", "high", "critical"]);

export const controlTypeEnum = pgEnum("control_type", [
  "preventive",
  "detective",
  "corrective",
  "directive",
]);

export const controlEffectivenessEnum = pgEnum("control_effectiveness", [
  "effective",
  "partially_effective",
  "ineffective",
  "not_tested",
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const findingRemediationStatusEnum = pgEnum("finding_remediation_status", [
  "open",
  "in_progress",
  "completed",
  "overdue",
  "risk_accepted",
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
    riskRating: riskRatingEnum("risk_rating").notNull().default("medium"),
    status: riskStatusEnum("status").notNull().default("identified"),
    treatment: riskTreatmentEnum("treatment"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    reviewFrequency: text("review_frequency").notNull().default("quarterly"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    controls: jsonb("controls").$type<Array<{ id: string; title: string; status: string }>>().default([]),
    mitigationPlan: text("mitigation_plan"),
    residualLikelihood: integer("residual_likelihood"),
    residualImpact: integer("residual_impact"),
    residualRiskScore: integer("residual_risk_score"),
    residualRiskRating: riskRatingEnum("residual_risk_rating"),
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
    attachmentRefs: jsonb("attachment_refs").$type<string[]>().default([]),
    questionnaireAnswers: jsonb("questionnaire_answers").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("vendor_risks_org_idx").on(t.orgId) }),
);

// ── Risk Controls ──────────────────────────────────────────────────────────
export const riskControls = pgTable(
  "risk_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    controlNumber: text("control_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    controlType: controlTypeEnum("control_type").notNull().default("preventive"),
    controlCategory: text("control_category").notNull().default("manual"),
    controlFrequency: text("control_frequency").notNull().default("monthly"),
    controlOwnerId: uuid("control_owner_id").references(() => users.id, { onDelete: "set null" }),
    mappedRiskIds: text("mapped_risk_ids").array().notNull().default([]),
    effectivenessRating: controlEffectivenessEnum("effectiveness_rating").notNull().default("not_tested"),
    lastTestedDate: timestamp("last_tested_date", { withTimezone: true }),
    nextTestDate: timestamp("next_test_date", { withTimezone: true }),
    lastEvidenceUrl: text("last_evidence_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgControlNumberIdx: uniqueIndex("risk_controls_org_number_idx").on(t.orgId, t.controlNumber),
    orgIdx: index("risk_controls_org_idx").on(t.orgId),
  }),
);

// ── Risk control evidence (SOC-style artifacts) ───────────────────────────
export const riskControlEvidence = pgTable(
  "risk_control_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    controlId: uuid("control_id")
      .notNull()
      .references(() => riskControls.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    storageUri: text("storage_uri").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("risk_control_evidence_org_idx").on(t.orgId),
    controlIdx: index("risk_control_evidence_control_idx").on(t.controlId),
  }),
);

// ── Audit Findings ─────────────────────────────────────────────────────────
export const auditFindings = pgTable(
  "audit_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    auditPlanId: uuid("audit_plan_id")
      .notNull()
      .references(() => auditPlans.id, { onDelete: "cascade" }),
    findingNumber: text("finding_number").notNull(),
    title: text("title").notNull(),
    findingSeverity: findingSeverityEnum("finding_severity").notNull().default("medium"),
    criteria: text("criteria").notNull(),
    condition: text("condition").notNull(),
    cause: text("cause").notNull(),
    effect: text("effect").notNull(),
    recommendation: text("recommendation"),
    managementResponse: text("management_response"),
    agreedAction: text("agreed_action"),
    actionOwnerId: uuid("action_owner_id").references(() => users.id, { onDelete: "set null" }),
    remediationStatus: findingRemediationStatusEnum("remediation_status").notNull().default("open"),
    targetRemediationDate: timestamp("target_remediation_date", { withTimezone: true }),
    actualRemediationDate: timestamp("actual_remediation_date", { withTimezone: true }),
    linkedRiskId: uuid("linked_risk_id").references(() => risks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditPlanIdx: index("audit_findings_audit_plan_idx").on(t.auditPlanId),
    orgIdx: index("audit_findings_org_idx").on(t.orgId),
    remediationStatusIdx: index("audit_findings_remediation_status_idx").on(t.remediationStatus),
  }),
);

export const risksRelations = relations(risks, ({ one, many }) => ({
  org: one(organizations, { fields: [risks.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [risks.ownerId], references: [users.id] }),
  controls: many(riskControls),
  auditFindings: many(auditFindings),
}));

export const riskControlsRelations = relations(riskControls, ({ one }) => ({
  org: one(organizations, { fields: [riskControls.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [riskControls.controlOwnerId], references: [users.id] }),
}));

export const auditFindingsRelations = relations(auditFindings, ({ one }) => ({
  auditPlan: one(auditPlans, { fields: [auditFindings.auditPlanId], references: [auditPlans.id] }),
  actionOwner: one(users, { fields: [auditFindings.actionOwnerId], references: [users.id] }),
}));
