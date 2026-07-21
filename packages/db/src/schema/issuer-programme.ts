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
    // RoPA lifecycle: active → retired (soft, keeps the register auditable).
    status: text("status").notNull().default("active"),
    linkedPrivacyMatterId: uuid("linked_privacy_matter_id").references(() => legalMatters.id, {
      onDelete: "set null",
    }),
    dpoSignOffAt: timestamp("dpo_sign_off_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
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
    // Lifecycle: prepared → submitting → filed (SRN issued) | not_configured | failed.
    status: text("status").notNull().default("prepared"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    notes: text("notes"),
    // MCA21 V3 portal push (G4): the prepared e-Form body + the portal ack, plus
    // the retry/soft-fail tracking that mirrors the EPFO ECR / E-Way Bill loops.
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    ackJson: jsonb("ack_json").$type<Record<string, unknown>>(),
    portalError: text("portal_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("mca_filing_records_org_idx").on(t.orgId),
    srnIdx: index("mca_filing_records_srn_idx").on(t.srn),
  }),
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
    // Privacy regime this request is handled under. India-only ("DPDP") for now;
    // the column exists so the same engine can serve other regimes (e.g. CCPA) later
    // without a data-model retrofit.
    regimeCode: text("regime_code").notNull().default("DPDP"),
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
    // Erasure evidence: stamped when an erasure-type DSR is fulfilled and the
    // per-table erasure map has actually purged/anonymised the Principal's data.
    erasureExecutedAt: timestamp("erasure_executed_at", { withTimezone: true }),
    erasureSummary: text("erasure_summary"),
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

// ── DPDP Act 2023 — Consent ledger (Sprint 1.2) ─────────────────────────────
// §6: consent must be free, specific, informed, unconditional and unambiguous,
// and §6(4)–(6): a Data Principal may withdraw it as easily as it was given.
// We keep a current-state record per (principal, purpose) plus an append-only
// event ledger so the withdrawal/renewal history is fully auditable.

export const consentStatusEnum = pgEnum("dpdp_consent_status", [
  "granted",
  "withdrawn",
  "expired",
]);

/**
 * dpdp_consent_records — current consent state for a Data Principal against a
 * specific processing purpose. Unique per (org, principalRef, purpose) so there
 * is exactly one authoritative current state; historical grants/withdrawals live
 * in dpdp_consent_events.
 */
export const dpdpConsentRecords = pgTable(
  "dpdp_consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Stable principal key (email / external subject id) so consent survives even
    // when the Principal has no platform user account.
    principalRef: text("principal_ref").notNull(),
    principalName: text("principal_name"),
    purpose: text("purpose").notNull(),
    // links to the RoPA activity governing this purpose, if any
    processingActivityId: uuid("processing_activity_id").references(
      () => dpdpProcessingActivities.id,
      { onDelete: "set null" },
    ),
    lawfulBasis: text("lawful_basis").notNull().default("consent"),
    // Privacy regime this consent is recorded under. India-only ("DPDP") for now;
    // present so the ledger can serve other regimes later without a retrofit.
    regimeCode: text("regime_code").notNull().default("DPDP"),
    status: consentStatusEnum("status").notNull().default("granted"),
    consentArtifact: text("consent_artifact"), // notice version / form ref shown at collection
    version: integer("version").notNull().default(1),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uidx: uniqueIndex("dpdp_consent_org_principal_purpose_uidx").on(
      t.orgId,
      t.principalRef,
      t.purpose,
    ),
    orgStatusIdx: index("dpdp_consent_org_status_idx").on(t.orgId, t.status),
    principalIdx: index("dpdp_consent_org_principal_idx").on(t.orgId, t.principalRef),
  }),
);

/**
 * dpdp_consent_events — append-only ledger: one row per grant / withdraw /
 * renew / expire action (child → parent CASCADE). This is the auditable proof
 * of when/how consent moved.
 */
export const dpdpConsentEvents = pgTable(
  "dpdp_consent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => dpdpConsentRecords.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // granted | withdrawn | renewed | expired
    fromStatus: consentStatusEnum("from_status"),
    toStatus: consentStatusEnum("to_status").notNull(),
    version: integer("version"),
    reason: text("reason"),
    // provenance of the request (self_service portal, email, phone, form, migration…)
    channel: text("channel"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    consentIdx: index("dpdp_consent_events_consent_idx").on(t.consentId, t.createdAt),
    orgIdx: index("dpdp_consent_events_org_idx").on(t.orgId),
  }),
);

export const dpdpConsentRecordsRelations = relations(dpdpConsentRecords, ({ many }) => ({
  events: many(dpdpConsentEvents),
}));

export const dpdpConsentEventsRelations = relations(dpdpConsentEvents, ({ one }) => ({
  consent: one(dpdpConsentRecords, {
    fields: [dpdpConsentEvents.consentId],
    references: [dpdpConsentRecords.id],
  }),
}));

// ── DPDP Act 2023 — Personal-data breach register (Sprint 1.3) ──────────────
// §8(6): on a personal-data breach the Data Fiduciary must notify the Data
// Protection Board and each affected Data Principal. The existing
// privacyBreachNotificationProfiles hold the per-jurisdiction notification
// window (default 72h); this register records actual breaches and clocks a
// notify_due_at from that window.

export const breachSeverityEnum = pgEnum("dpdp_breach_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const breachStatusEnum = pgEnum("dpdp_breach_status", [
  "detected", // logged, triage pending
  "assessing", // scope / impact assessment in progress
  "notifying", // notifications being issued (Board + Principals)
  "notified", // all required notifications sent
  "contained", // breach contained / remediated
  "closed", // final state
]);

/**
 * dpdp_breach_incidents — one row per personal-data breach. notify_due_at is
 * derived at intake from detected_at + the jurisdiction's notification window
 * (privacyBreachNotificationProfiles; falls back to 72h). Optional link to a
 * security incident (SET NULL) ties the privacy view to the SOC record.
 */
export const dpdpBreachIncidents = pgTable(
  "dpdp_breach_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(), // human-facing case number, unique per org
    title: text("title").notNull(),
    description: text("description"),
    severity: breachSeverityEnum("severity").notNull().default("medium"),
    status: breachStatusEnum("status").notNull().default("detected"),
    jurisdictionCode: text("jurisdiction_code").notNull().default("IN"),
    affectedDataPrincipals: integer("affected_data_principals"),
    dataCategories: text("data_categories"),
    linkedSecurityIncidentId: uuid("linked_security_incident_id").references(
      () => securityIncidents.id,
      { onDelete: "set null" },
    ),
    // clock
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    notificationWindowHours: integer("notification_window_hours").notNull().default(72),
    notifyDueAt: timestamp("notify_due_at", { withTimezone: true }).notNull(),
    boardNotifiedAt: timestamp("board_notified_at", { withTimezone: true }),
    principalsNotifiedAt: timestamp("principals_notified_at", { withTimezone: true }),
    containedAt: timestamp("contained_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUidx: uniqueIndex("dpdp_breach_org_reference_uidx").on(t.orgId, t.reference),
    orgStatusIdx: index("dpdp_breach_org_status_idx").on(t.orgId, t.status),
    dueIdx: index("dpdp_breach_org_notify_due_idx").on(t.orgId, t.notifyDueAt),
  }),
);

/**
 * dpdp_breach_events — append-only trail of every state change / notification /
 * note on a breach (child → parent CASCADE).
 */
export const dpdpBreachEvents = pgTable(
  "dpdp_breach_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    breachId: uuid("breach_id")
      .notNull()
      .references(() => dpdpBreachIncidents.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // created | status_changed | board_notified | principals_notified | note
    fromStatus: breachStatusEnum("from_status"),
    toStatus: breachStatusEnum("to_status"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    breachIdx: index("dpdp_breach_events_breach_idx").on(t.breachId, t.createdAt),
    orgIdx: index("dpdp_breach_events_org_idx").on(t.orgId),
  }),
);

export const dpdpBreachIncidentsRelations = relations(dpdpBreachIncidents, ({ many }) => ({
  events: many(dpdpBreachEvents),
}));

export const dpdpBreachEventsRelations = relations(dpdpBreachEvents, ({ one }) => ({
  breach: one(dpdpBreachIncidents, {
    fields: [dpdpBreachEvents.breachId],
    references: [dpdpBreachIncidents.id],
  }),
}));

// ── DPDP — Notification artifacts (Phase 1 automation loop) ─────────────────
// Every notification the automation loop *would* send (DSR overdue alert,
// breach board/principal notice, consent expiry, etc.) is recorded here as
// defensible audit evidence: what was said, to whom, on which channel, when.
// The NotificationDispatcher writes one row per notification. Today the
// LogOnlyDispatcher only persists here (status "logged"); a real email/SMS
// adapter added in the external pass will flip status to "sent" / "failed"
// without any schema change.
export const dpdpNotificationArtifacts = pgTable(
  "dpdp_notification_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // what this notification is about (kept as free text + id rather than an FK
    // so a single artifact log can serve dsr / breach / consent uniformly)
    relatedType: text("related_type").notNull(), // dsr | breach | consent
    relatedId: uuid("related_id").notNull(),
    channel: text("channel").notNull(), // email | board | principal | internal
    audience: text("audience").notNull(), // role name, email, or principal ref
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("logged"), // logged | sent | failed
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    relatedIdx: index("dpdp_notif_artifacts_related_idx").on(
      t.orgId,
      t.relatedType,
      t.relatedId,
    ),
    orgDispatchedIdx: index("dpdp_notif_artifacts_org_dispatched_idx").on(
      t.orgId,
      t.dispatchedAt,
    ),
  }),
);
