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
import { relations } from "drizzle-orm";
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
  "submitted",
  "acknowledged",
  "rejected",
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
    aadhaar: text("aadhaar"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMonthYearIdx: uniqueIndex("epfo_ecr_org_month_year_idx").on(t.orgId, t.month, t.year),
    orgIdx: index("epfo_ecr_org_idx").on(t.orgId),
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
