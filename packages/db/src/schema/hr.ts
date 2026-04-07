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

export const leaveTypeEnum = pgEnum("leave_type", [
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
    managerId: uuid("manager_id"),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    location: text("location"),
    city: text("city"),
    state: text("state"),
    isMetroCity: boolean("is_metro_city").notNull().default(false),
    pan: text("pan"),
    aadhaar: text("aadhaar"),
    uan: text("uan"),
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    bankName: text("bank_name"),
    taxRegime: taxRegimeEnum("tax_regime").notNull().default("new"),
    salaryStructureId: uuid("salary_structure_id").references(() => salaryStructures.id, { onDelete: "set null" }),
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
    statusId: uuid("status_id").references(() => ticketStatuses.id),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeMonthYearIdx: uniqueIndex("payslips_employee_month_year_idx").on(t.employeeId, t.month, t.year),
    orgIdx: index("payslips_org_idx").on(t.orgId),
    payrollRunIdx: index("payslips_payroll_run_idx").on(t.payrollRunId),
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
    title: text("title").notNull(),
    description: text("description"),
    cycle: okrCycleEnum("cycle").notNull().default("q1"),
    year: integer("year").notNull(),
    status: okrStatusEnum("status").notNull().default("draft"),
    overallProgress: integer("overall_progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("okr_objectives_org_idx").on(t.orgId),
    ownerIdx: index("okr_objectives_owner_idx").on(t.ownerId),
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
);
