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

export const secIncidentSeverityEnum = pgEnum("sec_incident_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const secIncidentStatusEnum = pgEnum("sec_incident_status", [
  "new",
  "triage",
  "containment",
  "eradication",
  "recovery",
  "closed",
  "false_positive",
]);

export const vulnSeverityEnum = pgEnum("vuln_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "none",
]);

export const vulnStatusEnum = pgEnum("vuln_status", [
  "open",
  "in_progress",
  "remediated",
  "accepted",
  "false_positive",
]);

// ── Security Incidents ─────────────────────────────────────────────────────
export const securityIncidents = pgTable(
  "security_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    severity: secIncidentSeverityEnum("severity").notNull().default("medium"),
    status: secIncidentStatusEnum("status").notNull().default("new"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    attackVector: text("attack_vector"),
    mitreTechniques: jsonb("mitre_techniques").$type<string[]>().default([]),
    iocs: jsonb("iocs").$type<Array<{ type: string; value: string; note?: string }>>().default([]),
    containmentActions: jsonb("containment_actions").$type<Array<{ action: string; performedAt: string; performedBy: string }>>().default([]),
    affectedSystems: jsonb("affected_systems").$type<string[]>().default([]),
    timeline: jsonb("timeline").$type<Array<{ time: string; event: string; actor?: string }>>().default([]),
    irPlaybookChecklist: jsonb("ir_playbook_checklist")
      .$type<Array<{ id: string; label: string; done: boolean }>>()
      .default([]),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNumberIdx: uniqueIndex("sec_incidents_org_number_idx").on(t.orgId, t.number),
    orgIdx: index("sec_incidents_org_idx").on(t.orgId),
    statusIdx: index("sec_incidents_status_idx").on(t.orgId, t.status),
  }),
);

// ── Vulnerabilities ────────────────────────────────────────────────────────
export const vulnerabilities = pgTable(
  "vulnerabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").references(() => securityIncidents.id, { onDelete: "set null" }),
    cveId: text("cve_id"),
    title: text("title").notNull(),
    description: text("description"),
    cvssScore: decimal("cvss_score", { precision: 3, scale: 1 }),
    severity: vulnSeverityEnum("severity").notNull().default("medium"),
    status: vulnStatusEnum("status").notNull().default("open"),
    affectedAssets: jsonb("affected_assets").$type<string[]>().default([]),
    remediation: text("remediation"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }),
    remediatedAt: timestamp("remediated_at", { withTimezone: true }),
    externalFingerprint: text("external_fingerprint"),
    scannerSource: text("scanner_source"),
    remediationSlaDays: integer("remediation_sla_days"),
    remediationDueAt: timestamp("remediation_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("vulnerabilities_org_idx").on(t.orgId),
    statusIdx: index("vulnerabilities_status_idx").on(t.orgId, t.status),
    cveIdx: index("vulnerabilities_cve_idx").on(t.cveId),
  }),
);

export const threatIntelligence = pgTable(
  "threat_intelligence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").notNull().references(() => securityIncidents.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // Threat Intelligence ID
    description: text("description"),
    documentUri: text("document_uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("threat_intelligence_org_idx").on(t.orgId),
    incidentIdx: index("threat_intelligence_incident_idx").on(t.incidentId),
  }),
);

export const complianceEvidence = pgTable(
  "compliance_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").notNull().references(() => securityIncidents.id, { onDelete: "cascade" }),
    riskId: uuid("risk_id"),
    complianceFrameworkId: uuid("compliance_framework_id"),
    auditId: uuid("audit_id"),
    auditDocUri: text("audit_doc_uri"),
    failedControlId: uuid("failed_control_id"),
    failedControlDocUri: text("failed_control_doc_uri"),
    securityPolicyId: uuid("security_policy_id"),
    securityPolicyDocUri: text("security_policy_doc_uri"),
    supportingDocUri: text("supporting_doc_uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("compliance_evidence_org_idx").on(t.orgId),
    incidentIdx: index("compliance_evidence_incident_idx").on(t.incidentId),
  }),
);

export const securityIncidentsRelations = relations(securityIncidents, ({ one, many }) => ({
  org: one(organizations, { fields: [securityIncidents.orgId], references: [organizations.id] }),
  assignee: one(users, { fields: [securityIncidents.assigneeId], references: [users.id], relationName: "si_assignee" }),
  reporter: one(users, { fields: [securityIncidents.reporterId], references: [users.id], relationName: "si_reporter" }),
  threatIntelligence: many(threatIntelligence),
  complianceEvidence: many(complianceEvidence),
}));

export const threatIntelligenceRelations = relations(threatIntelligence, ({ one }) => ({
  incident: one(securityIncidents, { fields: [threatIntelligence.incidentId], references: [securityIncidents.id] }),
}));

export const complianceEvidenceRelations = relations(complianceEvidence, ({ one }) => ({
  incident: one(securityIncidents, { fields: [complianceEvidence.incidentId], references: [securityIncidents.id] }),
}));
