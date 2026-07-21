import {
  boolean,
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
import { relations, sql } from "drizzle-orm";
import { organizations, users } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────
export const complianceItemStatusEnum = pgEnum("compliance_item_status", [
  "upcoming",
  "due_soon",
  "overdue",
  "filed",
  "not_applicable",
]);

export const complianceTypeEnum = pgEnum("compliance_type", [
  "annual",
  "event_based",
  "monthly",
  "quarterly",
]);

export const dinKycStatusEnum = pgEnum("din_kyc_status", ["active", "deactivated"]);

export const directorTypeEnum = pgEnum("director_type", [
  "executive",
  "non_executive",
  "independent",
  "nominee",
]);

export const portalUserStatusEnum = pgEnum("portal_user_status", [
  "pending_approval",
  "active",
  "inactive",
  "suspended",
]);

export const portalUserRoleEnum = pgEnum("portal_user_role", [
  "primary_contact",
  "secondary_contact",
  "read_only",
]);

export const mfaTypeEnum = pgEnum("mfa_type", ["otp_email", "otp_sms", "totp_app"]);

export const tdsFormTypeEnum = pgEnum("tds_form_type", ["24Q", "26Q", "27Q", "27EQ"]);

export const ecrSubmissionStatusEnum = pgEnum("ecr_submission_status", [
  "generated",
  "submitting",
  "submitted",
  "acknowledged",
  "rejected",
  "not_configured",
  "failed",
]);

export const statutoryMetricKeyEnum = pgEnum("statutory_metric_key", [
  "pf_wage_ceiling",
  "esi_wage_ceiling",
  "pt_slab",
  "lwf_rate",
  // Payment of Bonus Act eligibility wage ceiling (Labour Codes, eff. 2025-11-21).
  "bonus_eligibility_ceiling",
]);

// E-Way Bill lifecycle (G3): `pending` = created, awaiting NIC push;
// `generating` = in-flight; `generated` = EWB number issued; `cancelled` =
// cancelled on the NIC portal within the 24h window; `not_configured` when no
// NIC integration is connected; `failed` on a terminal portal error.
export const ewayBillStatusEnum = pgEnum("eway_bill_status", [
  "pending",
  "generating",
  "generated",
  "cancelled",
  "not_configured",
  "failed",
]);

// Statutory-return portal-push lifecycle (G2), shared by ESI monthly returns and
// PT challans: `generated` = built, awaiting push; `submitting` = in-flight to
// the portal; `submitted` = accepted (challan/return number issued); `rejected`
// = portal rejected the payload; `not_configured` when no portal integration is
// connected; `failed` on a terminal transport error.
export const statutoryReturnStatusEnum = pgEnum("statutory_return_status", [
  "generated",
  "submitting",
  "submitted",
  "rejected",
  "not_configured",
  "failed",
]);

// ── Compliance Calendar Items ──────────────────────────────────────────────
export const complianceCalendarItems = pgTable(
  "compliance_calendar_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    complianceType: complianceTypeEnum("compliance_type").notNull().default("annual"),
    eventName: text("event_name").notNull(),
    mcaForm: text("mca_form"),
    financialYear: text("financial_year"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: complianceItemStatusEnum("status").notNull().default("upcoming"),
    reminderDaysBefore: integer("reminder_days_before").array().notNull().default([30, 15, 7, 1]),
    filedDate: timestamp("filed_date", { withTimezone: true }),
    srn: text("srn"),
    ackDocumentUrl: text("ack_document_url"),
    penaltyPerDayInr: decimal("penalty_per_day_inr", { precision: 10, scale: 2 }).notNull().default("0"),
    daysOverdue: integer("days_overdue").notNull().default(0),
    totalPenaltyInr: decimal("total_penalty_inr", { precision: 12, scale: 2 }).notNull().default("0"),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("compliance_calendar_org_idx").on(t.orgId),
    dueDateIdx: index("compliance_calendar_due_date_idx").on(t.dueDate),
    statusIdx: index("compliance_calendar_status_idx").on(t.status),
  }),
);

// ── Directors ──────────────────────────────────────────────────────────────
export const directors = pgTable(
  "directors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    din: text("din").notNull(),
    fullName: text("full_name").notNull(),
    pan: text("pan"),
    /**
     * DPDP PAN minimisation match aids, stored ALONGSIDE raw `pan` (raw is retained for
     * statutory filing). `panMaskedHash` = peppered HMAC-SHA256 (lib/pii-hash.ts) match key;
     * `panMaskedDisplay` = `XXXXXX234A` visual mask. Never a substitute for the raw value.
     */
    panMaskedHash: text("pan_masked_hash"),
    panMaskedDisplay: text("pan_masked_display"),
    /**
     * DPDP Aadhaar minimisation: raw Aadhaar is never stored (raw column dropped in migration
     * 0037 after backfill). `aadhaarMaskedHash` is a peppered HMAC-SHA256 of the raw value
     * (statutory match only, see apps/api lib/pii-hash.ts); `aadhaarMaskedDisplay` is the
     * `XXXX-XXXX-1234` visual mask. Mirrors `esigners.aadhaarMaskedHash`.
     */
    aadhaarMaskedHash: text("aadhaar_masked_hash"),
    aadhaarMaskedDisplay: text("aadhaar_masked_display"),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    nationality: text("nationality").notNull().default("Indian"),
    residentialStatus: text("residential_status").notNull().default("resident"),
    residentialAddress: text("residential_address"),
    directorType: directorTypeEnum("director_type").notNull().default("executive"),
    dateOfAppointment: timestamp("date_of_appointment", { withTimezone: true }),
    dateOfCessation: timestamp("date_of_cessation", { withTimezone: true }),
    dinKycStatus: dinKycStatusEnum("din_kyc_status").notNull().default("active"),
    dinKycLastCompleted: timestamp("din_kyc_last_completed", { withTimezone: true }),
    dscDetails: jsonb("dsc_details")
      .$type<Array<{
        tokenSerial: string;
        issuingCA: string;
        validFrom: string;
        validTo: string;
        class: "CLASS2" | "CLASS3";
      }>>()
      .notNull()
      .default([]),
    linkedEmployeeId: uuid("linked_employee_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDinIdx: uniqueIndex("directors_org_din_idx").on(t.orgId, t.din),
    orgIdx: index("directors_org_idx").on(t.orgId),
    dinKycStatusIdx: index("directors_din_kyc_status_idx").on(t.dinKycStatus),
  }),
);

// ── Portal Users (External Customer Portal) ────────────────────────────────
export const portalUsers = pgTable(
  "portal_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portalUserId: text("portal_user_id").notNull(),
    customerId: uuid("customer_id"),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(1),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    role: portalUserRoleEnum("role").notNull().default("primary_contact"),
    status: portalUserStatusEnum("status").notNull().default("pending_approval"),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaType: mfaTypeEnum("mfa_type"),
    totpSecret: text("totp_secret"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    isLocked: boolean("is_locked").notNull().default(false),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockReason: text("lock_reason"),
    isSelfRegistered: boolean("is_self_registered").notNull().default(false),
    createdByEmployeeId: uuid("created_by_employee_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPortalUserIdIdx: uniqueIndex("portal_users_org_portal_user_id_idx").on(t.orgId, t.portalUserId),
    orgEmailIdx: uniqueIndex("portal_users_org_email_idx").on(t.orgId, t.email),
    orgIdx: index("portal_users_org_idx").on(t.orgId),
    statusIdx: index("portal_users_status_idx").on(t.status),
  }),
);

// ── Portal Audit Log ───────────────────────────────────────────────────────
export const portalAuditLog = pgTable(
  "portal_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portalUserId: uuid("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
    customerId: uuid("customer_id"),
    action: text("action").notNull(),
    endpoint: text("endpoint"),
    httpMethod: text("http_method"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    responseStatusCode: integer("response_status_code"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    portalUserIdx: index("portal_audit_log_portal_user_idx").on(t.portalUserId),
    orgIdx: index("portal_audit_log_org_idx").on(t.orgId),
    loggedAtIdx: index("portal_audit_log_logged_at_idx").on(t.loggedAt),
  }),
);

// ── TDS Challan Records ────────────────────────────────────────────────────
export const tdsChallanRecords = pgTable(
  "tds_challan_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tdsSection: text("tds_section").notNull(),
    formType: tdsFormTypeEnum("form_type").notNull().default("24Q"),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    totalTdsDeducted: decimal("total_tds_deducted", { precision: 14, scale: 2 }).notNull().default("0"),
    totalTdsDeposited: decimal("total_tds_deposited", { precision: 14, scale: 2 }).notNull().default("0"),
    bsrCode: text("bsr_code"),
    challanSerialNumber: text("challan_serial_number"),
    paymentDate: timestamp("payment_date", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("tds_challan_records_org_idx").on(t.orgId),
    monthYearIdx: index("tds_challan_records_month_year_idx").on(t.month, t.year),
  }),
);

// ── EPFO ECR Submissions ───────────────────────────────────────────────────
export const epfoEcrSubmissions = pgTable(
  "epfo_ecr_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    ecrFileUrl: text("ecr_file_url"),
    submissionStatus: ecrSubmissionStatusEnum("submission_status").notNull().default("generated"),
    epfoAckNumber: text("epfo_ack_number"),
    totalEmployeeContribution: decimal("total_employee_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    totalEmployerContribution: decimal("total_employer_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    totalEpsContribution: decimal("total_eps_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    totalEpfContribution: decimal("total_epf_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Portal-push tracking (G2): the EPFO/GSP round-trip records its last
    // attempt + error so the submit loop can retry and soft-fail cleanly.
    portalError: text("portal_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMonthYearIdx: uniqueIndex("epfo_ecr_org_month_year_idx").on(t.orgId, t.month, t.year),
    orgIdx: index("epfo_ecr_org_idx").on(t.orgId),
  }),
);

// ── Statutory Ceilings (versioned, effective-dated config) ─────────────────
// Drives PF/ESI wage ceilings, PT slabs and LWF rates without code changes so
// effective-dated Labour-Code revisions land as data, not a redeploy.
// orgId NULL = platform default; a non-null row overrides the default for that org.
// `value` holds scalar metrics (pf/esi ceilings); `slabsJson` holds the PT slab
// table or the LWF {employee,employer,frequency} shape.
export const statutoryCeilings = pgTable(
  "statutory_ceilings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    metricKey: statutoryMetricKeyEnum("metric_key").notNull(),
    stateCode: text("state_code"),
    value: decimal("value", { precision: 14, scale: 2 }),
    // Open blob: holds a PT slab table (per-state, variable shape) or the LWF
    // {employee,employer,frequency} record; the resolver casts to the concrete
    // PtSlabTable[string] / LwfRateTable[string] shape at read time.
    slabsJson: jsonb("slabs_json").$type<Record<string, unknown>>(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("statutory_ceilings_lookup_idx").on(
      t.metricKey,
      t.stateCode,
      t.effectiveFrom,
    ),
    orgIdx: index("statutory_ceilings_org_idx").on(t.orgId),
    // One row per (scope, metric, state, effectiveFrom). Nullable orgId/stateCode
    // are coalesced to sentinels so platform-default (orgId NULL) and
    // state-agnostic (stateCode NULL) rows collapse to a single arbiter — a
    // plain multi-column unique index would treat NULLs as distinct and let
    // duplicates through. This is the arbiter the seed's ON CONFLICT binds to.
    scopeUniqueIdx: uniqueIndex("statutory_ceilings_scope_unique_idx").on(
      sql`coalesce(${t.orgId}::text, '00000000-0000-0000-0000-000000000000')`,
      t.metricKey,
      sql`coalesce(${t.stateCode}, '')`,
      t.effectiveFrom,
    ),
  }),
);

// ── E-Way Bills (G3: NIC portal push) ──────────────────────────────────────
// One row per E-Way Bill request against a tax invoice. `payloadJson` holds the
// canonical NIC request body built at enqueue time; `ewbNo`/`validUpto` are
// filled from the NIC ack. Gated upstream by isEWayBillRequired (₹50k, goods).
// A partial unique index (below) keeps at most one live (non-cancelled) EWB per
// invoice so retries reuse the row instead of spawning duplicates.
export const ewayBills = pgTable(
  "eway_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Soft reference to procurement.invoices — no hard FK to avoid a cross-file
    // circular import; the router validates the invoice exists + is org-scoped.
    invoiceId: uuid("invoice_id").notNull(),
    invoiceNumber: text("invoice_number"),
    status: ewayBillStatusEnum("status").notNull().default("pending"),
    ewbNo: text("ewb_no"),
    validUpto: timestamp("valid_upto", { withTimezone: true }),
    consignmentValue: decimal("consignment_value", { precision: 14, scale: 2 }).notNull().default("0"),
    // Open blobs: vendor-defined NIC request body / ack envelope; the workflow
    // casts to the concrete EwayBillGenerate shape at read time.
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    ackJson: jsonb("ack_json").$type<Record<string, unknown>>(),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    portalError: text("portal_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("eway_bills_org_idx").on(t.orgId),
    invoiceIdx: index("eway_bills_invoice_idx").on(t.orgId, t.invoiceId),
    ewbNoIdx: index("eway_bills_ewb_no_idx").on(t.ewbNo),
  }),
);

// ── ESI Monthly Return Submissions (G2: ESIC portal push) ──────────────────
// One row per (org, month, year) ESI monthly-contribution return. `totalEmployee`
// / `totalEmployer` hold the aggregated ESI contribution split; `returnFileUrl`
// is the generated MC (monthly contribution) file; `challanNumber` is filled from
// the ESIC ack. Portal-push tracking mirrors epfoEcrSubmissions so the submit
// loop can retry and soft-fail cleanly on `not_configured`.
export const esiChallanRecords = pgTable(
  "esi_challan_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    returnFileUrl: text("return_file_url"),
    status: statutoryReturnStatusEnum("status").notNull().default("generated"),
    challanNumber: text("challan_number"),
    totalEmployees: integer("total_employees").notNull().default(0),
    totalEmployeeContribution: decimal("total_employee_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    totalEmployerContribution: decimal("total_employer_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
    // Open blob: the canonical ESIC MC request body built at enqueue time; the
    // workflow casts to the concrete EsiReturnUpload shape at read time.
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    ackJson: jsonb("ack_json").$type<Record<string, unknown>>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    portalError: text("portal_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMonthYearIdx: uniqueIndex("esi_challan_org_month_year_idx").on(t.orgId, t.month, t.year),
    orgIdx: index("esi_challan_org_idx").on(t.orgId),
  }),
);

// ── PT Challan Submissions (G2: state PT portal push) ──────────────────────
// One row per (org, state, month, year) professional-tax challan. PT is a
// state-level levy, so `stateCode` is part of the identity. `totalPtDeducted`
// aggregates the PT withheld; `challanNumber` is filled from the state portal
// ack. Portal-push tracking mirrors epfoEcrSubmissions.
export const ptChallanRecords = pgTable(
  "pt_challan_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stateCode: text("state_code").notNull(),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    ptRegistrationNumber: text("pt_registration_number"),
    challanFileUrl: text("challan_file_url"),
    status: statutoryReturnStatusEnum("status").notNull().default("generated"),
    challanNumber: text("challan_number"),
    totalEmployees: integer("total_employees").notNull().default(0),
    totalPtDeducted: decimal("total_pt_deducted", { precision: 14, scale: 2 }).notNull().default("0"),
    // Open blob: the canonical state-PT request body built at enqueue time; the
    // workflow casts to the concrete PtChallanUpload shape at read time.
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    ackJson: jsonb("ack_json").$type<Record<string, unknown>>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    portalError: text("portal_error"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStateMonthYearIdx: uniqueIndex("pt_challan_org_state_month_year_idx").on(t.orgId, t.stateCode, t.month, t.year),
    orgIdx: index("pt_challan_org_idx").on(t.orgId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const complianceCalendarItemsRelations = relations(complianceCalendarItems, ({ one }) => ({
  org: one(organizations, { fields: [complianceCalendarItems.orgId], references: [organizations.id] }),
  assignedTo: one(users, { fields: [complianceCalendarItems.assignedToId], references: [users.id] }),
}));

export const directorsRelations = relations(directors, ({ one }) => ({
  org: one(organizations, { fields: [directors.orgId], references: [organizations.id] }),
}));

export const portalUsersRelations = relations(portalUsers, ({ one, many }) => ({
  org: one(organizations, { fields: [portalUsers.orgId], references: [organizations.id] }),
  auditLogs: many(portalAuditLog),
}));

export const portalAuditLogRelations = relations(portalAuditLog, ({ one }) => ({
  portalUser: one(portalUsers, { fields: [portalAuditLog.portalUserId], references: [portalUsers.id] }),
}));
