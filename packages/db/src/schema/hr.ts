import {
  type AnyPgColumn,
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
import { expenseCategoryEnum, expenseStatusEnum } from "./expenses";
import { ticketStatuses } from "./tickets";

// ── Enums ──────────────────────────────────────────────────────────────────
export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contractor",
  "intern",
]);

export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "probation",
  "on_leave",
  "resigned",
  "terminated",
  "offboarded",
]);

export const taxRegimeEnum = pgEnum("tax_regime", ["old", "new"]);

export const payrollRunStatusEnum = pgEnum("payroll_run_status", [
  "draft",
  "under_review",
  "hr_approved",
  "finance_approved",
  "cfo_approved",
  "paid",
]);

export const hrCaseTypeEnum = pgEnum("hr_case_type", [
  "onboarding",
  "offboarding",
  "leave",
  "policy",
  "benefits",
  "workplace",
  "equipment",
]);

export const hrCaseStatusEnum = pgEnum("hr_case_status", ["open", "in_progress", "closed"]);

export const leaveTypeEnum = pgEnum("leave_type", [
  "primary",
  "annual",
  "vacation",
  "sick",
  "parental",
  "bereavement",
  "unpaid",
  "other",
]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ── Salary Structures ──────────────────────────────────────────────────────
export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    structureName: text("structure_name").notNull(),
    ctcAnnual: decimal("ctc_annual", { precision: 14, scale: 2 }).notNull(),
    basicPercent: decimal("basic_percent", { precision: 5, scale: 2 }).notNull().default("40"),
    hraPercentOfBasic: decimal("hra_percent_of_basic", { precision: 5, scale: 2 }).notNull().default("50"),
    ltaAnnual: decimal("lta_annual", { precision: 12, scale: 2 }).notNull().default("0"),
    medicalAllowanceAnnual: decimal("medical_allowance_annual", { precision: 12, scale: 2 }).notNull().default("15000"),
    conveyanceAllowanceAnnual: decimal("conveyance_allowance_annual", { precision: 12, scale: 2 }).notNull().default("19200"),
    bonusAnnual: decimal("bonus_annual", { precision: 12, scale: 2 }).notNull().default("0"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("salary_structures_org_idx").on(t.orgId),
  }),
);

// ── Employees ──────────────────────────────────────────────────────────────
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull(), // EMP-0001
    department: text("department"),
    title: text("title"),
    jobGrade: text("job_grade"),
    managerId: uuid("manager_id"),
    dottedLineManagerId: uuid("dotted_line_manager_id"),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    location: text("location"),
    city: text("city"),
    state: text("state"),
    isMetroCity: boolean("is_metro_city").notNull().default(false),
    pan: text("pan"),
    /**
     * DPDP PAN minimisation match aids, stored ALONGSIDE raw `pan` (raw is retained for
     * TDS/Form-16 filing). `panMaskedHash` = peppered HMAC-SHA256 (lib/pii-hash.ts) match key;
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
    uan: text("uan"),
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    bankName: text("bank_name"),
    taxRegime: taxRegimeEnum("tax_regime").notNull().default("new"),
    salaryStructureId: uuid("salary_structure_id").references(() => salaryStructures.id, { onDelete: "set null" }),
    /**
     * Assigned working shift (G8). Drives late / half-day derivation on
     * self-service punches. Nullable — when unset, capture falls back to the
     * org's default shift (`shiftSchedules.isDefault`), then to a built-in
     * 09:00 / 8h / 10-min-grace baseline. `set null` on delete so retiring a
     * shift definition un-assigns rather than orphaning the employee.
     */
    shiftScheduleId: uuid("shift_schedule_id").references((): AnyPgColumn => shiftSchedules.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    confirmationDate: timestamp("confirmation_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: employeeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmployeeIdIdx: uniqueIndex("employees_org_employee_id_idx").on(t.orgId, t.employeeId),
    orgIdx: index("employees_org_idx").on(t.orgId),
    userIdx: uniqueIndex("employees_user_idx").on(t.userId),
  }),
);

// ── HR Cases ───────────────────────────────────────────────────────────────
export const hrCases = pgTable(
  "hr_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseType: hrCaseTypeEnum("case_type").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    statusId: uuid("status_id").references(() => ticketStatuses.id, { onDelete: "restrict" }),
    status: hrCaseStatusEnum("status").notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    priority: text("priority").notNull().default("medium"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("hr_cases_org_idx").on(t.orgId),
    employeeIdx: index("hr_cases_employee_idx").on(t.employeeId),
  }),
);

// ── HR Case Tasks ──────────────────────────────────────────────────────────
export const hrCaseTasks = pgTable(
  "hr_case_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => hrCases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"), // pending | in_progress | done
    dueDate: timestamp("due_date", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: index("hr_case_tasks_case_idx").on(t.caseId),
  }),
);

// ── Onboarding Templates ───────────────────────────────────────────────────
export const onboardingTemplates = pgTable(
  "onboarding_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    department: text("department"),
    tasks: jsonb("tasks")
      .$type<Array<{
        title: string;
        assigneeRole: string;
        dueDateOffsetDays: number;
        description?: string;
      }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("onboarding_templates_org_idx").on(t.orgId),
  }),
);

export const onboardingDetails = pgTable(
  "onboarding_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name"),
    primaryEmail: text("primary_email"),
    secondaryEmail: text("secondary_email"),
    phone: text("phone"),
    secondaryPhone: text("secondary_phone"),
    educationDocs: text("education_docs"),
    employeeDocs: text("employee_docs"),
    signedOfferLetter: text("signed_offer_letter"),
    photo: text("photo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("onboarding_details_org_idx").on(t.orgId),
    empIdx: index("onboarding_details_emp_idx").on(t.employeeId),
  }),
);

// ── Leave Requests ─────────────────────────────────────────────────────────
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    days: decimal("days", { precision: 5, scale: 1 }).notNull(),
    status: leaveStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("leave_requests_org_idx").on(t.orgId),
    employeeIdx: index("leave_requests_employee_idx").on(t.employeeId),
    statusIdx: index("leave_requests_status_idx").on(t.status),
  }),
);

// ── Leave Balances ─────────────────────────────────────────────────────────
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    year: integer("year").notNull(),
    totalDays: decimal("total_days", { precision: 5, scale: 1 }).notNull().default("0"),
    usedDays: decimal("used_days", { precision: 5, scale: 1 }).notNull().default("0"),
    pendingDays: decimal("pending_days", { precision: 5, scale: 1 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeTypeYearIdx: uniqueIndex("leave_balances_employee_type_year_idx").on(
      t.employeeId,
      t.type,
      t.year,
    ),
  }),
);

// ── Payroll Runs ───────────────────────────────────────────────────────────

export type PayrollWorkflowMeta = {
  errors: Array<{ employeeId?: string; message: string }>;
  /** Set when period is locked / aggregates computed from `payroll-cycle`. */
  payrollEmployeeCount?: number;
  approvals: Array<{
    id: string;
    step: string;
    status: string;
    decidedAt?: string;
    comments?: string | null;
  }>;
};

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    status: payrollRunStatusEnum("status").notNull().default("draft"),
    /** 12-step UI lifecycle (DRAFT, PERIOD_LOCKED, …, COMPLETED). */
    pipelineStatus: text("pipeline_status").notNull().default("DRAFT"),
    runNumber: integer("run_number").notNull().default(1),
    workflowMetadata: jsonb("workflow_metadata")
      .$type<PayrollWorkflowMeta>()
      .notNull()
      .default(sql`'{"errors":[],"approvals":[]}'::jsonb`),
    totalGross: decimal("total_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    totalDeductions: decimal("total_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
    totalNet: decimal("total_net", { precision: 14, scale: 2 }).notNull().default("0"),
    totalPfEmployee: decimal("total_pf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPfEmployer: decimal("total_pf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPt: decimal("total_pt", { precision: 12, scale: 2 }).notNull().default("0"),
    totalTds: decimal("total_tds", { precision: 12, scale: 2 }).notNull().default("0"),
    approvedByHrId: uuid("approved_by_hr_id").references(() => users.id, { onDelete: "set null" }),
    approvedByFinanceId: uuid("approved_by_finance_id").references(() => users.id, { onDelete: "set null" }),
    approvedByCfoId: uuid("approved_by_cfo_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgMonthYearIdx: uniqueIndex("payroll_runs_org_month_year_idx").on(t.orgId, t.month, t.year),
    orgIdx: index("payroll_runs_org_idx").on(t.orgId),
  }),
);

// ── Payslips ───────────────────────────────────────────────────────────────
export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    /** G8: attendance basis of this payslip's gross (paid days vs loss-of-pay days). */
    paidDays: decimal("paid_days", { precision: 5, scale: 1 }).notNull().default("0"),
    lopDays: decimal("lop_days", { precision: 5, scale: 1 }).notNull().default("0"),
    basic: decimal("basic", { precision: 12, scale: 2 }).notNull().default("0"),
    hra: decimal("hra", { precision: 12, scale: 2 }).notNull().default("0"),
    specialAllowance: decimal("special_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    lta: decimal("lta", { precision: 12, scale: 2 }).notNull().default("0"),
    medicalAllowance: decimal("medical_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    conveyanceAllowance: decimal("conveyance_allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    bonus: decimal("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    grossEarnings: decimal("gross_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    pfEmployee: decimal("pf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
    pfEmployer: decimal("pf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
    professionalTax: decimal("professional_tax", { precision: 10, scale: 2 }).notNull().default("0"),
    lwf: decimal("lwf", { precision: 10, scale: 2 }).notNull().default("0"),
    tds: decimal("tds", { precision: 12, scale: 2 }).notNull().default("0"),
    totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
    netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    ytdGross: decimal("ytd_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    ytdTds: decimal("ytd_tds", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRegimeUsed: taxRegimeEnum("tax_regime_used").notNull().default("new"),
    pdfUrl: text("pdf_url"),
    /**
     * DPDP retention floor: statutory retention expiry (run `paidAt` + 8y, fallback create
     * time + 8y). The erasure executor must not anonymise/delete this payslip's identity link
     * until this date passes (RBI / Income Tax payroll retention). Nullable legacy (backfilled).
     */
    retainUntilDate: timestamp("retain_until_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeMonthYearIdx: uniqueIndex("payslips_employee_month_year_idx").on(t.employeeId, t.month, t.year),
    orgIdx: index("payslips_org_idx").on(t.orgId),
    payrollRunIdx: index("payslips_payroll_run_idx").on(t.payrollRunId),
    orgRetainIdx: index("payslips_org_retain_idx").on(t.orgId, t.retainUntilDate),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const employeesRelations = relations(employees, ({ one, many }) => ({
  org: one(organizations, { fields: [employees.orgId], references: [organizations.id] }),
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  salaryStructure: one(salaryStructures, { fields: [employees.salaryStructureId], references: [salaryStructures.id] }),
  hrCases: many(hrCases),
  leaveRequests: many(leaveRequests),
  leaveBalances: many(leaveBalances),
  payslips: many(payslips),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ one, many }) => ({
  org: one(organizations, { fields: [payrollRuns.orgId], references: [organizations.id] }),
  payslips: many(payslips),
}));

export const payslipsRelations = relations(payslips, ({ one }) => ({
  employee: one(employees, { fields: [payslips.employeeId], references: [employees.id] }),
  payrollRun: one(payrollRuns, { fields: [payslips.payrollRunId], references: [payrollRuns.id] }),
}));

// ── Gratuity (Payment of Gratuity Act, 1972) ───────────────────────────────
// Monthly accrual provisioning: one row per (employee, year, month) recognising
// the incremental gratuity liability earned that month, so the liability builds
// evenly rather than as a lump sum at exit. Idempotent per period.
export const gratuityAccruals = pgTable(
  "gratuity_accruals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12 calendar month
    basicPlusDA: decimal("basic_plus_da", { precision: 12, scale: 2 }).notNull().default("0"),
    accrualAmount: decimal("accrual_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Running provisioned liability for this employee after this period. */
    cumulativeAccrued: decimal("cumulative_accrued", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empPeriodIdx: uniqueIndex("gratuity_accruals_emp_period_idx").on(
      t.employeeId,
      t.year,
      t.month,
    ),
    orgIdx: index("gratuity_accruals_org_idx").on(t.orgId),
  }),
);

// Final gratuity settlement computed at exit (Payment of Gratuity Act §4).
export const gratuitySettlements = pgTable(
  "gratuity_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    lastDrawnBasicPlusDA: decimal("last_drawn_basic_plus_da", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    completedYears: integer("completed_years").notNull().default(0),
    trailingMonths: integer("trailing_months").notNull().default(0),
    countedYears: integer("counted_years").notNull().default(0),
    eligible: boolean("eligible").notNull().default(false),
    /** Formula result before the statutory cap. */
    grossGratuity: decimal("gross_gratuity", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Payable gratuity after the statutory cap. */
    gratuityAmount: decimal("gratuity_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    cappedAtCeiling: boolean("capped_at_ceiling").notNull().default(false),
    reason: text("reason"), // resignation | retirement | death | disablement | termination
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
    settledById: uuid("settled_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    empIdx: uniqueIndex("gratuity_settlements_emp_idx").on(t.employeeId),
    orgIdx: index("gratuity_settlements_org_idx").on(t.orgId),
  }),
);

export const gratuityAccrualsRelations = relations(gratuityAccruals, ({ one }) => ({
  employee: one(employees, {
    fields: [gratuityAccruals.employeeId],
    references: [employees.id],
  }),
}));

export const gratuitySettlementsRelations = relations(gratuitySettlements, ({ one }) => ({
  employee: one(employees, {
    fields: [gratuitySettlements.employeeId],
    references: [employees.id],
  }),
}));

// ── Leave Accrual Policy & Ledger ──────────────────────────────────────────
// Per-org, per-leave-type policy that drives monthly accrual, the year-end
// carry-forward cap and whether the balance is encashable. One row per
// (org, leave type).
export const leavePolicies = pgTable(
  "leave_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    /** Total leave days credited per full year. */
    annualEntitlementDays: decimal("annual_entitlement_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    /** Explicit monthly rate; null = annualEntitlementDays / 12. */
    monthlyAccrualDays: decimal("monthly_accrual_days", { precision: 5, scale: 1 }),
    /** Maximum unused days that may roll into the next year (0 = none). */
    maxCarryForwardDays: decimal("max_carry_forward_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    /** Whether the leave type may be encashed. */
    encashable: boolean("encashable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgTypeIdx: uniqueIndex("leave_policies_org_type_idx").on(t.orgId, t.type),
    orgIdx: index("leave_policies_org_idx").on(t.orgId),
  }),
);

// Immutable ledger of leave-accrual events. Each row is one recognised event:
// a monthly accrual, a year-end carry-forward, a lapse, or an encashment.
// Monthly accrual is idempotent per (employee, type, year, month).
export const leaveAccrualEventTypeEnum = pgEnum("leave_accrual_event_type", [
  "accrual",
  "carry_forward",
  "lapse",
  "encashment",
]);

export const leaveAccrualEvents = pgTable(
  "leave_accrual_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    eventType: leaveAccrualEventTypeEnum("event_type").notNull(),
    year: integer("year").notNull(),
    /** Calendar month 1-12 for accrual events; null for year-end events. */
    month: integer("month"),
    /** Signed day delta: +accrual/+carry-forward, −lapse/−encashment. */
    days: decimal("days", { precision: 6, scale: 1 }).notNull().default("0"),
    /** Rupee value for encashment events; 0 otherwise. */
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency for the monthly accrual event only.
    accrualPeriodIdx: uniqueIndex("leave_accrual_events_accrual_period_idx").on(
      t.employeeId,
      t.type,
      t.eventType,
      t.year,
      t.month,
    ),
    orgIdx: index("leave_accrual_events_org_idx").on(t.orgId),
    employeeIdx: index("leave_accrual_events_employee_idx").on(t.employeeId),
  }),
);

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  org: one(organizations, { fields: [leavePolicies.orgId], references: [organizations.id] }),
}));

export const leaveAccrualEventsRelations = relations(leaveAccrualEvents, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveAccrualEvents.employeeId],
    references: [employees.id],
  }),
}));

// ── India Public Holiday Calendar ─────────────────────────────────────────
export const publicHolidayTypeEnum = pgEnum("public_holiday_type", [
  "national",
  "restricted",
  "state",
  "company",
]);

export const publicHolidays = pgTable(
  "public_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: publicHolidayTypeEnum("type").notNull().default("national"),
    /** ISO 3166-2:IN state code, e.g. "MH", or null for all-India */
    stateCode: text("state_code"),
    year: integer("year").notNull(),
    isOptional: boolean("is_optional").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgYearIdx: index("public_holidays_org_year_idx").on(t.orgId, t.year),
    orgDateIdx: index("public_holidays_org_date_idx").on(t.orgId, t.date),
  }),
);

// ── Attendance ────────────────────────────────────────────────────────────
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "half_day",
  "late",
  "on_leave",
  "holiday",
  "weekend",
]);

export const shiftTypeEnum = pgEnum("shift_type", [
  "morning",
  "afternoon",
  "night",
  "flexible",
  "remote",
]);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    status: attendanceStatusEnum("status").notNull().default("present"),
    shiftType: shiftTypeEnum("shift_type").notNull().default("flexible"),
    checkIn: timestamp("check_in", { withTimezone: true }),
    checkOut: timestamp("check_out", { withTimezone: true }),
    /** Total hours worked (decimal, e.g. 8.5) */
    hoursWorked: decimal("hours_worked", { precision: 4, scale: 2 }),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmployeeDateIdx: uniqueIndex("attendance_org_employee_date_idx").on(t.orgId, t.employeeId, t.date),
    orgDateIdx: index("attendance_org_date_idx").on(t.orgId, t.date),
  }),
);

// ── Shift schedules (G8) ──────────────────────────────────────────────────
/**
 * A named working-shift definition. `startMinutes` is minutes-from-local-
 * midnight (e.g. 540 = 09:00) and `durationMinutes` the expected working span
 * (e.g. 480 = 8h) — stored as offsets (not a `time`/`timestamp`) so they are
 * timezone-agnostic and compare cleanly against a punch's local wall-clock.
 * `graceMinutes` is the lateness tolerance before a check-in counts as `late`.
 * Exactly one row per org may carry `isDefault = true` (partial unique index):
 * it is the fallback shift for employees with no explicit assignment.
 */
export const shiftSchedules = pgTable(
  "shift_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Minutes from local midnight the shift starts (e.g. 540 = 09:00). */
    startMinutes: integer("start_minutes").notNull().default(540),
    /** Expected working span in minutes (e.g. 480 = 8h). */
    durationMinutes: integer("duration_minutes").notNull().default(480),
    /** Lateness tolerance before a check-in is flagged `late`. */
    graceMinutes: integer("grace_minutes").notNull().default(10),
    /** The org fallback shift for employees with no assignment. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("shift_schedules_org_idx").on(t.orgId),
    orgNameIdx: uniqueIndex("shift_schedules_org_name_idx").on(t.orgId, t.name),
    // At most one default shift per org.
    orgDefaultIdx: uniqueIndex("shift_schedules_org_default_idx")
      .on(t.orgId)
      .where(sql`${t.isDefault} = true`),
  }),
);

// ── Expense Management (enums: ./expenses) ────────────────────────────────
export const expenseClaims = pgTable(
  "expense_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: expenseCategoryEnum("category").notNull().default("miscellaneous"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
    status: expenseStatusEnum("status").notNull().default("draft"),
    receiptUrl: text("receipt_url"),
    projectCode: text("project_code"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
    paymentMode: text("payment_mode"),
    notes: text("notes"),
    /** Free-text merchant string (OCR-extracted or manual). */
    merchant: text("merchant"),
    /** Distance for `transport`/`fuel` claims, used by the mileage policy. */
    mileageKm: decimal("mileage_km", { precision: 10, scale: 2 }),
    /** Stable code from {@link evaluateExpenseClaim} when a claim violates org policy. */
    policyViolationCode: text("policy_violation_code"),
    policyViolationReason: text("policy_violation_reason"),
    /** Raw structured output from receipt-OCR for audit / re-extraction; provider-specific shape. */
    ocrExtracted: jsonb("ocr_extracted").$type<Record<string, unknown>>(),
    ocrConfidence: decimal("ocr_confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("expense_claims_org_idx").on(t.orgId),
    employeeIdx: index("expense_claims_employee_idx").on(t.employeeId),
    statusIdx: index("expense_claims_status_idx").on(t.status),
    numberOrgIdx: uniqueIndex("expense_claims_number_org_idx").on(t.orgId, t.number),
  }),
);

// ── OKR / Goal Management ─────────────────────────────────────────────────
export const okrCycleEnum = pgEnum("okr_cycle", ["q1", "q2", "q3", "q4", "annual"]);
export const okrStatusEnum = pgEnum("okr_status", ["draft", "active", "completed", "cancelled"]);
export const krStatusEnum = pgEnum("kr_status", ["on_track", "at_risk", "behind", "completed"]);

export const okrObjectives = pgTable(
  "okr_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Self-referential alignment link: a child objective (individual/team)
     * cascades up to a parent objective (team/org). SET NULL so detaching or
     * deleting a parent orphans the child rather than deleting it.
     */
    parentObjectiveId: uuid("parent_objective_id").references(
      (): AnyPgColumn => okrObjectives.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    cycle: okrCycleEnum("cycle").notNull().default("q1"),
    year: integer("year").notNull(),
    status: okrStatusEnum("status").notNull().default("draft"),
    /** Own progress: average attainment of this objective's own key results. */
    overallProgress: integer("overall_progress").notNull().default(0),
    /**
     * G12: persisted cascade rollup — average of this objective's own progress
     * and every descendant's own progress. Recomputed and walked up the parent
     * chain on every key-result change, so a parent always reflects how its
     * aligned children are tracking without an on-read traversal.
     */
    rollupProgress: integer("rollup_progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("okr_objectives_org_idx").on(t.orgId),
    ownerIdx: index("okr_objectives_owner_idx").on(t.ownerId),
    parentIdx: index("okr_objectives_parent_idx").on(t.parentObjectiveId),
  }),
);

export const okrKeyResults = pgTable(
  "okr_key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => okrObjectives.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull().default("100"),
    currentValue: decimal("current_value", { precision: 12, scale: 2 }).notNull().default("0"),
    unit: text("unit").notNull().default("%"),
    status: krStatusEnum("status").notNull().default("on_track"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("okr_key_results_org_idx").on(t.orgId),
    objectiveIdx: index("okr_key_results_objective_idx").on(t.objectiveId),
  }),
);

// ── Offboarding Details ───────────────────────────────────────────────────
export const offboardingDetails = pgTable(
  "offboarding_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name"),
    separationDocs: text("separation_docs"),
    clearanceDocs: text("clearance_docs"),
    securityClearance: text("security_clearance"),
    status: text("status").notNull().default("pending"), // pending | completed
    ffStatus: text("ff_status").notNull().default("pending"), // pending | initiated | completed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("offboarding_details_org_idx").on(t.orgId),
    empIdx: index("offboarding_details_emp_idx").on(t.employeeId),
  }),
);

// ── Lifecycle Events ───────────────────────────────────────────────────────
export const lifecycleEvents = pgTable(
  "lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    eventType: text("event_type").notNull().default("employee_transition"),
    hrTaskStatus: text("hr_task_status").notNull().default("pending"), // pending | completed
    itTaskStatus: text("it_task_status").notNull().default("pending"), // pending | completed
    payrollCompliance: text("payroll_compliance").notNull().default("no"), // yes | no
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("lifecycle_events_org_idx").on(t.orgId),
    empIdx: index("lifecycle_events_emp_idx").on(t.employeeId),
  }),
);
