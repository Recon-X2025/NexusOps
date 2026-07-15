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
    gstinIdx: uniqueIndex("gstin_registry_gstin_idx").on(t.gstin),
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

// ── GSTR-2B ITC Reconciliation ─────────────────────────────────────────────
/** Outcome of matching a supplier invoice in books against the GSTR-2B line. */
export const gstr2bReconStatusEnum = pgEnum("gstr2b_recon_status", [
  "matched", // present in both, values within tolerance → ITC eligible
  "mismatch", // present in both, tax values differ → held pending
  "missing_in_2b", // in books, not in portal → supplier hasn't filed → not yet claimable
  "missing_in_books", // in portal, not in books → unrecorded purchase
]);

/**
 * One GSTR-2B ingestion run for a (gstin, month, year). Stores the reconciled
 * totals so the eligible ITC that feeds the GSTR-3B claim is auditable: only
 * `matched` lines contribute to `eligibleItc`.
 */
export const gstr2bImports = pgTable(
  "gstr2b_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gstinId: uuid("gstin_id").references(() => gstinRegistry.id, { onDelete: "restrict" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    financialYear: text("financial_year").notNull(),
    /** Line counts by reconciliation outcome. */
    totalLines: integer("total_lines").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    mismatchCount: integer("mismatch_count").notNull().default(0),
    missingIn2bCount: integer("missing_in_2b_count").notNull().default(0),
    missingInBooksCount: integer("missing_in_books_count").notNull().default(0),
    /** ITC available in the 2B statement (sum of all portal tax). */
    portalItc: decimal("portal_itc", { precision: 15, scale: 2 }).notNull().default("0"),
    /** ITC eligible to claim now = tax on matched lines only. */
    eligibleItc: decimal("eligible_itc", { precision: 15, scale: 2 }).notNull().default("0"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgGstinPeriodIdx: uniqueIndex("gstr2b_imports_org_gstin_period_idx").on(t.orgId, t.gstinId, t.month, t.year),
    orgIdx: index("gstr2b_imports_org_idx").on(t.orgId),
  }),
);

/** Per-invoice reconciliation outcome within a GSTR-2B import. */
export const gstr2bReconLines = pgTable(
  "gstr2b_recon_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    importId: uuid("import_id")
      .notNull()
      .references(() => gstr2bImports.id, { onDelete: "cascade" }),
    supplierGstin: text("supplier_gstin").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: text("invoice_date"),
    status: gstr2bReconStatusEnum("status").notNull(),
    /** Book-side tax (from our purchase invoices). */
    bookTaxable: decimal("book_taxable", { precision: 15, scale: 2 }),
    bookIgst: decimal("book_igst", { precision: 15, scale: 2 }),
    bookCgst: decimal("book_cgst", { precision: 15, scale: 2 }),
    bookSgst: decimal("book_sgst", { precision: 15, scale: 2 }),
    /** Portal-side tax (from the GSTR-2B statement). */
    portalTaxable: decimal("portal_taxable", { precision: 15, scale: 2 }),
    portalIgst: decimal("portal_igst", { precision: 15, scale: 2 }),
    portalCgst: decimal("portal_cgst", { precision: 15, scale: 2 }),
    portalSgst: decimal("portal_sgst", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    importIdx: index("gstr2b_recon_lines_import_idx").on(t.importId),
    orgStatusIdx: index("gstr2b_recon_lines_org_status_idx").on(t.orgId, t.status),
  }),
);

// ── Bank Reconciliation ────────────────────────────────────────────────────
export const bankStatementStatusEnum = pgEnum("bank_statement_status", [
  "importing",
  "in_progress",
  "reconciled",
]);

export const bankTxnStatusEnum = pgEnum("bank_txn_status", [
  "unmatched",
  "matched",
  "ignored",
]);

/** A bank statement import session for a specific bank (cash/bank) account. */
export const bankStatements = pgTable(
  "bank_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The COA bank/cash account this statement reconciles against. */
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    /** Closing balance per the bank statement (for reconciliation check). */
    statementBalance: decimal("statement_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    status: bankStatementStatusEnum("status").notNull().default("in_progress"),
    txnCount: integer("txn_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgAccountIdx: index("bank_statements_org_account_idx").on(t.orgId, t.accountId),
    orgStatusIdx: index("bank_statements_org_status_idx").on(t.orgId, t.status),
  }),
);

/** An individual line imported from a bank statement. */
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => bankStatements.id, { onDelete: "cascade" }),
    txnDate: timestamp("txn_date", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    /** Positive = money in (credit to bank), negative = money out (debit). */
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    status: bankTxnStatusEnum("status").notNull().default("unmatched"),
    /** Journal entry this bank line was matched to (if any). */
    matchedJournalEntryId: uuid("matched_journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
    /** Confidence score (0-100) of the suggested auto-match. */
    matchScore: integer("match_score"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    matchedById: uuid("matched_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatementIdx: index("bank_txns_org_statement_idx").on(t.orgId, t.statementId),
    orgStatusIdx: index("bank_txns_org_status_idx").on(t.orgId, t.status),
    matchedJeIdx: index("bank_txns_matched_je_idx").on(t.matchedJournalEntryId),
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

export const gstr2bImportsRelations = relations(gstr2bImports, ({ one, many }) => ({
  org: one(organizations, { fields: [gstr2bImports.orgId], references: [organizations.id] }),
  gstin: one(gstinRegistry, { fields: [gstr2bImports.gstinId], references: [gstinRegistry.id] }),
  lines: many(gstr2bReconLines),
}));

export const gstr2bReconLinesRelations = relations(gstr2bReconLines, ({ one }) => ({
  org: one(organizations, { fields: [gstr2bReconLines.orgId], references: [organizations.id] }),
  import: one(gstr2bImports, { fields: [gstr2bReconLines.importId], references: [gstr2bImports.id] }),
}));

export const bankStatementsRelations = relations(bankStatements, ({ one, many }) => ({
  org: one(organizations, { fields: [bankStatements.orgId], references: [organizations.id] }),
  account: one(chartOfAccounts, { fields: [bankStatements.accountId], references: [chartOfAccounts.id] }),
  transactions: many(bankTransactions),
}));

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  org: one(organizations, { fields: [bankTransactions.orgId], references: [organizations.id] }),
  statement: one(bankStatements, { fields: [bankTransactions.statementId], references: [bankStatements.id] }),
  matchedJournalEntry: one(journalEntries, { fields: [bankTransactions.matchedJournalEntryId], references: [journalEntries.id] }),
}));
