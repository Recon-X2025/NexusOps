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
  "on_leave",
  "offboarded",
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
    startDate: timestamp("start_date", { withTimezone: true }),
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

// ── Relations ──────────────────────────────────────────────────────────────
export const employeesRelations = relations(employees, ({ one, many }) => ({
  org: one(organizations, { fields: [employees.orgId], references: [organizations.id] }),
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  hrCases: many(hrCases),
  leaveRequests: many(leaveRequests),
  leaveBalances: many(leaveBalances),
}));
