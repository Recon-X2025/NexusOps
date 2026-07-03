import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";
import { legalMatters } from "./legal";
import { contracts } from "./contracts";
import { securityIncidents } from "./security";
import { tickets } from "./tickets";
import { vulnerabilities } from "./security";

export const issuerProgrammeMatrix = pgTable(
  "issuer_programme_matrix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matrixKey: text("matrix_key").notNull(),
    title: text("title").notNull(),
    closureCriterion: text("closure_criterion"),
    status: text("status").notNull().default("implemented"),
    productRef: text("product_ref"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgKeyUidx: uniqueIndex("issuer_programme_matrix_org_key_uidx").on(t.orgId, t.matrixKey),
    orgIdx: index("issuer_programme_matrix_org_idx").on(t.orgId),
  }),
);

export const relatedPartyTransactions = pgTable(
  "related_party_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    counterpartyName: text("counterparty_name").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    transactionDate: timestamp("transaction_date", { withTimezone: true }),
    approvalResolutionRef: text("approval_resolution_ref"),
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("related_party_transactions_org_idx").on(t.orgId) }),
);

export const dpdpProcessingActivities = pgTable(
  "dpdp_processing_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    activityName: text("activity_name").notNull(),
    purpose: text("purpose"),
    lawfulBasis: text("lawful_basis"),
    dataCategories: text("data_categories"),
    linkedPrivacyMatterId: uuid("linked_privacy_matter_id").references(() => legalMatters.id, {
      onDelete: "set null",
    }),
    dpoSignOffAt: timestamp("dpo_sign_off_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("dpdp_processing_activities_org_idx").on(t.orgId) }),
);

export const statutoryRegisterEntries = pgTable(
  "statutory_register_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    registerType: text("register_type").notNull(),
    entryKey: text("entry_key").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uidx: uniqueIndex("statutory_register_entries_uidx").on(t.orgId, t.registerType, t.entryKey),
    orgIdx: index("statutory_register_entries_org_idx").on(t.orgId),
  }),
);

export const mcaFilingRecords = pgTable(
  "mca_filing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formCode: text("form_code").notNull(),
    srn: text("srn"),
    status: text("status").notNull().default("prepared"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("mca_filing_records_org_idx").on(t.orgId) }),
);

export const xbrlExportJobs = pgTable(
  "xbrl_export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodLabel: text("period_label").notNull(),
    status: text("status").notNull().default("queued"),
    handoffUri: text("handoff_uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("xbrl_export_jobs_org_idx").on(t.orgId) }),
);

export const lodorCalendarEntries = pgTable(
  "lodor_calendar_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventCode: text("event_code").notNull(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("lodor_calendar_entries_org_idx").on(t.orgId, t.dueAt) }),
);

export const shareholderGrievances = pgTable(
  "shareholder_grievances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference"),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("open"),
    exchangeRef: text("exchange_ref"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({ orgIdx: index("shareholder_grievances_org_idx").on(t.orgId) }),
);

export const shareholderVotingResults = pgTable(
  "shareholder_voting_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingLabel: text("meeting_label").notNull(),
    resolution: text("resolution").notNull(),
    ballotDate: timestamp("ballot_date", { withTimezone: true }),
    outcome: text("outcome"),
    votesFor: integer("votes_for"),
    votesAgainst: integer("votes_against"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("shareholder_voting_results_org_idx").on(t.orgId) }),
);

export const directorInterestDisclosures = pgTable(
  "director_interest_disclosures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    directorName: text("director_name").notNull(),
    din: text("din"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("director_interest_disclosures_org_idx").on(t.orgId) }),
);

export const contractClauseTemplates = pgTable(
  "contract_clause_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jurisdiction: text("jurisdiction").notNull().default("IN"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("contract_clause_templates_org_idx").on(t.orgId) }),
);

export const msmePaymentTrackers = pgTable(
  "msme_payment_trackers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorName: text("vendor_name").notNull(),
    invoiceRef: text("invoice_ref"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    interestDue: numeric("interest_due", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("msme_payment_trackers_org_idx").on(t.orgId) }),
);

export const contractEsignEvents = pgTable(
  "contract_esign_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    auditPayload: jsonb("audit_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("contract_esign_events_org_idx").on(t.orgId),
    contractIdx: index("contract_esign_events_contract_idx").on(t.contractId),
  }),
);

export const whistleblowerProgramSettings = pgTable("whistleblower_program_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  policyVersion: text("policy_version"),
  escalationMatrix: jsonb("escalation_matrix").$type<unknown[]>().default([]),
  retentionDays: integer("retention_days").default(2555),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const femaReturnRecords = pgTable(
  "fema_return_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    returnType: text("return_type").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("fema_return_records_org_idx").on(t.orgId) }),
);

export const cciCombinationFilings = pgTable(
  "cci_combination_filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notifiable: boolean("notifiable").notNull().default(true),
    status: text("status").notNull().default("tracking"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("cci_combination_filings_org_idx").on(t.orgId) }),
);

export const sectorRegulatorLicences = pgTable(
  "sector_regulator_licences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sector: text("sector").notNull(),
    licenceNumber: text("licence_number").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    conditions: text("conditions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("sector_regulator_licences_org_idx").on(t.orgId) }),
);

export const legalHoldRecords = pgTable(
  "legal_hold_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").references(() => legalMatters.id, { onDelete: "set null" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    custodian: text("custodian"),
    active: boolean("active").notNull().default(true),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("legal_hold_records_org_idx").on(t.orgId) }),
);

export const secIncidentTicketLinks = pgTable(
  "sec_incident_ticket_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => securityIncidents.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("sec_incident_ticket_links_unique").on(t.incidentId, t.ticketId),
    orgIdx: index("sec_incident_ticket_links_org_idx").on(t.orgId),
  }),
);

export const vulnerabilityExceptions = pgTable(
  "vulnerability_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vulnerabilityId: uuid("vulnerability_id")
      .notNull()
      .references(() => vulnerabilities.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("vulnerability_exceptions_org_idx").on(t.orgId) }),
);

export const privacyBreachNotificationProfiles = pgTable(
  "privacy_breach_notification_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    regulatorName: text("regulator_name"),
    notificationOffsetHours: integer("notification_offset_hours").notNull().default(72),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uidx: uniqueIndex("privacy_breach_profiles_org_jurisdiction_uidx").on(t.orgId, t.jurisdictionCode),
    orgIdx: index("privacy_breach_profiles_org_idx").on(t.orgId),
  }),
);

export const resourceReadAuditEvents = pgTable(
  "resource_read_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("resource_read_audit_org_idx").on(t.orgId, t.createdAt) }),
);

export const contractEsignEventsRelations = relations(contractEsignEvents, ({ one }) => ({
  contract: one(contracts, { fields: [contractEsignEvents.contractId], references: [contracts.id] }),
}));

// ── DPDP Act 2023 — Data Subject Request (DSR) lifecycle (Sprint 1.1) ────────
// A Data Principal (individual) exercises a right against the org as Data
// Fiduciary. Rights per §11–14: access, correction, erasure, grievance,
// nomination. The Fiduciary must respond within a prescribed period; we clock
// a due date from receipt and drive the state machine access→…→closed.

export const dsrRequestTypeEnum = pgEnum("dsr_request_type", [
  "access", // §11 — right to access information about processing
  "correction", // §12 — correction / completion / update
  "erasure", // §12 — erasure of personal data
  "grievance", // §13 — grievance redressal
  "nomination", // §14 — nominate another individual
]);

export const dsrStatusEnum = pgEnum("dsr_status", [
  "received", // logged, verification pending
  "verifying", // identity verification in progress
  "in_progress", // verified, being fulfilled
  "on_hold", // paused (e.g. awaiting Principal input / legal hold)
  "fulfilled", // action completed, ready to close
  "rejected", // refused (with reason) per statutory exemption
  "closed", // final state
]);

/**
 * dpdp_data_subject_requests — one row per DSR from a Data Principal.
 * requestedByUserId is a nullable actor reference (SET NULL) — most Principals
 * are external and won't have a platform user; assignedToUserId is the DPO/
 * handler. A due clock (dueAt) is set from receivedAt + response window.
 */
export const dpdpDataSubjectRequests = pgTable(
  "dpdp_data_subject_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(), // human-facing case number, unique per org
    requestType: dsrRequestTypeEnum("request_type").notNull(),
    status: dsrStatusEnum("status").notNull().default("received"),
    // Data Principal identity (external individual — not necessarily a platform user)
    principalName: text("principal_name").notNull(),
    principalEmail: text("principal_email"),
    principalPhone: text("principal_phone"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    details: text("details"),
    // linked privacy matter (RoPA / legal context)
    linkedPrivacyMatterId: uuid("linked_privacy_matter_id").references(() => legalMatters.id, {
      onDelete: "set null",
    }),
    // response clock
    responseWindowDays: integer("response_window_days").notNull().default(30),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUidx: uniqueIndex("dpdp_dsr_org_reference_uidx").on(t.orgId, t.reference),
    orgStatusIdx: index("dpdp_dsr_org_status_idx").on(t.orgId, t.status),
    dueIdx: index("dpdp_dsr_org_due_idx").on(t.orgId, t.dueAt),
  }),
);

/**
 * dpdp_dsr_events — append-only audit trail of every state transition / note on
 * a DSR (child → parent CASCADE). Gives the DPO a defensible timeline.
 */
export const dpdpDsrEvents = pgTable(
  "dpdp_dsr_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => dpdpDataSubjectRequests.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // created | status_changed | assigned | note | fulfilled | rejected | closed
    fromStatus: dsrStatusEnum("from_status"),
    toStatus: dsrStatusEnum("to_status"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("dpdp_dsr_events_request_idx").on(t.requestId, t.createdAt),
    orgIdx: index("dpdp_dsr_events_org_idx").on(t.orgId),
  }),
);

export const dpdpDataSubjectRequestsRelations = relations(
  dpdpDataSubjectRequests,
  ({ many }) => ({
    events: many(dpdpDsrEvents),
  }),
);

export const dpdpDsrEventsRelations = relations(dpdpDsrEvents, ({ one }) => ({
  request: one(dpdpDataSubjectRequests, {
    fields: [dpdpDsrEvents.requestId],
    references: [dpdpDataSubjectRequests.id],
  }),
}));
