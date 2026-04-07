/**
 * Accounting Foundation Schema
 * Implements: Chart of Accounts, Journal Entries, General Ledger, Accounts Payable/Receivable
 */

import {
  boolean,
  decimal,
  index,
  integer,
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
export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
  "contra_asset",
  "contra_liability",
  "contra_equity",
  "contra_income",
  "contra_expense",
]);

export const accountSubTypeEnum = pgEnum("account_sub_type", [
  // Assets
  "bank",
  "cash",
  "accounts_receivable",
  "other_current_asset",
  "fixed_asset",
  "accumulated_depreciation",
  "other_asset",
  // Liabilities
  "accounts_payable",
  "credit_card",
  "other_current_liability",
  "long_term_liability",
  // Equity
  "owners_equity",
  "retained_earnings",
  "share_capital",
  // Income
  "income",
  "other_income",
  // Expense
  "cost_of_goods_sold",
  "expense",
  "other_expense",
  "payroll_expense",
  "depreciation",
]);

export const journalEntryStatusEnum = pgEnum("journal_entry_status", [
  "draft",
  "posted",
  "reversed",
  "voided",
]);

export const journalEntryTypeEnum = pgEnum("journal_entry_type", [
  "manual",
  "invoice",
  "payment",
  "payroll",
  "depreciation",
  "closing",
  "opening",
  "reversal",
  "gst_liability",
  "tds_deduction",
]);

// ── Chart of Accounts ──────────────────────────────────────────────────────
export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    subType: accountSubTypeEnum("sub_type"),
    parentId: uuid("parent_id"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    currency: text("currency").notNull().default("INR"),
    /** Opening balance (positive = debit normal accounts; for credit-normal, store as negative) */
    openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    /** GST account linkage */
    gstinId: uuid("gstin_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCodeIdx: uniqueIndex("coa_org_code_idx").on(t.orgId, t.code),
    orgTypeIdx: index("coa_org_type_idx").on(t.orgId, t.type),
    orgActiveIdx: index("coa_org_active_idx").on(t.orgId, t.isActive),
  }),
);

// ── Journal Entries ────────────────────────────────────────────────────────
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: journalEntryTypeEnum("type").notNull().default("manual"),
    status: journalEntryStatusEnum("status").notNull().default("draft"),
    description: text("description"),
    reference: text("reference"),
    currency: text("currency").notNull().default("INR"),
    /** For multi-currency: exchange rate to INR */
    exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).notNull().default("1"),
    totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).notNull().default("0"),
    totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).notNull().default("0"),
    /** ID of the reversed/voided entry */
    reversalOfId: uuid("reversal_of_id"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    postedById: uuid("posted_by_id").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    financialYear: text("financial_year"),
    period: integer("period"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDateIdx: index("je_org_date_idx").on(t.orgId, t.date),
    orgStatusIdx: index("je_org_status_idx").on(t.orgId, t.status),
    orgNumberIdx: uniqueIndex("je_org_number_idx").on(t.orgId, t.number),
    orgFyPeriodIdx: index("je_org_fy_period_idx").on(t.orgId, t.financialYear, t.period),
  }),
);

// ── Journal Entry Lines ────────────────────────────────────────────────────
export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    /** Debit amount — must be >= 0 */
    debitAmount: decimal("debit_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    /** Credit amount — must be >= 0 */
    creditAmount: decimal("credit_amount", { precision: 15, scale: 2 }).notNull().default("0"),
    description: text("description"),
    /** Ledger running balance after this line (maintained on post) */
    runningBalance: decimal("running_balance", { precision: 15, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jeIdx: index("jel_je_idx").on(t.journalEntryId),
    accountIdx: index("jel_account_idx").on(t.accountId),
    orgAccountIdx: index("jel_org_account_idx").on(t.orgId, t.accountId),
  }),
);

// ── GSTIN Registry (Multi-GSTIN support) ─────────────────────────────────
export const gstinRegistry = pgTable(
  "gstin_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gstin: text("gstin").notNull(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    stateCode: text("state_code").notNull(),
    stateName: text("state_name"),
    address: text("address"),
    registrationDate: timestamp("registration_date", { withTimezone: true }),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    invoiceSeriesPrefix: text("invoice_series_prefix"),
    currentInvoiceSeq: integer("current_invoice_seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgGstinIdx: uniqueIndex("gstin_registry_org_gstin_idx").on(t.orgId, t.gstin),
    orgIdx: index("gstin_registry_org_idx").on(t.orgId),
  }),
);

// ── GSTR Filing Records ───────────────────────────────────────────────────
export const gstrFilingStatusEnum = pgEnum("gstr_filing_status", [
  "draft",
  "ready",
  "filed",
  "accepted",
  "rejected",
]);

export const gstrFilings = pgTable(
  "gstr_filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gstinId: uuid("gstin_id")
      .references(() => gstinRegistry.id, { onDelete: "restrict" }),
    formType: text("form_type").notNull(), // "GSTR-1", "GSTR-3B", "GSTR-9", etc.
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    financialYear: text("financial_year").notNull(),
    status: gstrFilingStatusEnum("status").notNull().default("draft"),
    /** Total output tax liability */
    totalOutputTax: decimal("total_output_tax", { precision: 15, scale: 2 }).notNull().default("0"),
    /** Total ITC claimed */
    totalItc: decimal("total_itc", { precision: 15, scale: 2 }).notNull().default("0"),
    /** Net tax payable */
    netPayable: decimal("net_payable", { precision: 15, scale: 2 }).notNull().default("0"),
    /** JSON payload for portal upload */
    jsonPayload: text("json_payload"),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    arn: text("arn"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgGstinMonthYearIdx: index("gstr_filings_org_gstin_month_year_idx").on(t.orgId, t.gstinId, t.month, t.year),
    orgStatusIdx: index("gstr_filings_org_status_idx").on(t.orgId, t.status),
  }),
);

// ── Relations ──────────────────────────────────────────────────────────────
export const chartOfAccountsRelations = relations(chartOfAccounts, ({ one, many }) => ({
  org: one(organizations, { fields: [chartOfAccounts.orgId], references: [organizations.id] }),
  parent: one(chartOfAccounts, { fields: [chartOfAccounts.parentId], references: [chartOfAccounts.id], relationName: "parent_child" }),
  children: many(chartOfAccounts, { relationName: "parent_child" }),
  journalLines: many(journalEntryLines),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  org: one(organizations, { fields: [journalEntries.orgId], references: [organizations.id] }),
  lines: many(journalEntryLines),
}));

export const journalEntryLinesRelations = relations(journalEntryLines, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [journalEntryLines.journalEntryId], references: [journalEntries.id] }),
  account: one(chartOfAccounts, { fields: [journalEntryLines.accountId], references: [chartOfAccounts.id] }),
}));

export const gstinRegistryRelations = relations(gstinRegistry, ({ one, many }) => ({
  org: one(organizations, { fields: [gstinRegistry.orgId], references: [organizations.id] }),
  gstrFilings: many(gstrFilings),
}));
