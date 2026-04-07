import {
  boolean,
  decimal,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ── Enums ─────────────────────────────────────────────────────────────────
export const expenseStatusEnum = pgEnum("expense_status", [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "paid",
  "cancelled",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "travel",
  "accommodation",
  "meals",
  "transport",
  "office_supplies",
  "software",
  "marketing",
  "training",
  "entertainment",
  "medical",
  "other",
]);

// ── Expense Reports ────────────────────────────────────────────────────────
export const expenseReports = pgTable(
  "expense_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    submittedById: uuid("submitted_by_id").notNull().references(() => users.id),
    approverId: uuid("approver_id").references(() => users.id),
    status: expenseStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("INR"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    reimbursableAmount: decimal("reimbursable_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    businessPurpose: text("business_purpose"),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("expense_reports_org_idx").on(t.orgId),
    submitterIdx: index("expense_reports_submitter_idx").on(t.orgId, t.submittedById),
    statusIdx: index("expense_reports_status_idx").on(t.orgId, t.status),
  }),
);

// ── Expense Line Items ─────────────────────────────────────────────────────
export const expenseItems = pgTable(
  "expense_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").notNull().references(() => expenseReports.id, { onDelete: "cascade" }),
    category: expenseCategoryEnum("category").notNull().default("other"),
    description: text("description").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    receiptUrl: text("receipt_url"),
    receiptFileName: text("receipt_file_name"),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
    merchant: text("merchant"),
    isBillable: boolean("is_billable").notNull().default(false),
    projectId: uuid("project_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reportIdx: index("expense_items_report_idx").on(t.reportId),
    orgIdx: index("expense_items_org_idx").on(t.orgId),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const expenseReportsRelations = relations(expenseReports, ({ one, many }) => ({
  org: one(organizations, { fields: [expenseReports.orgId], references: [organizations.id] }),
  submittedBy: one(users, { fields: [expenseReports.submittedById], references: [users.id] }),
  approver: one(users, { fields: [expenseReports.approverId], references: [users.id] }),
  items: many(expenseItems),
}));

export const expenseItemsRelations = relations(expenseItems, ({ one }) => ({
  report: one(expenseReports, { fields: [expenseItems.reportId], references: [expenseReports.id] }),
  org: one(organizations, { fields: [expenseItems.orgId], references: [organizations.id] }),
}));
