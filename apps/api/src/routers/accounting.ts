/**
 * Accounting Router
 * Covers: Chart of Accounts, Journal Entries, General Ledger, Trial Balance,
 *         Balance Sheet, P&L, GSTR-1 / GSTR-3B generation, GSTIN registry
 */

import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";

// ── Helpers ────────────────────────────────────────────────────────────────

function currentFY(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed
  return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function fyYear(fy: string): number {
  return parseInt(fy.split("-")[0]!, 10);
}

/** Standard India COA seed list */
const INDIA_COA_SEED = [
  // ── Assets
  { code: "1000", name: "Assets",                      type: "asset",     subType: "other_asset",         isSystem: true, parentCode: null },
  { code: "1100", name: "Current Assets",              type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1000" },
  { code: "1110", name: "Cash and Cash Equivalents",   type: "asset",     subType: "cash",                isSystem: true, parentCode: "1100" },
  { code: "1120", name: "Bank Accounts",               type: "asset",     subType: "bank",                isSystem: false, parentCode: "1100" },
  { code: "1130", name: "Accounts Receivable (Trade)", type: "asset",     subType: "accounts_receivable", isSystem: true, parentCode: "1100" },
  { code: "1140", name: "GST Input Tax Credit (ITC)",  type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1100" },
  { code: "1141", name: "IGST ITC",                    type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1140" },
  { code: "1142", name: "CGST ITC",                    type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1140" },
  { code: "1143", name: "SGST ITC",                    type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1140" },
  { code: "1150", name: "TDS Receivable",              type: "asset",     subType: "other_current_asset", isSystem: true, parentCode: "1100" },
  { code: "1160", name: "Prepaid Expenses",            type: "asset",     subType: "other_current_asset", isSystem: false, parentCode: "1100" },
  { code: "1200", name: "Fixed Assets",                type: "asset",     subType: "fixed_asset",         isSystem: false, parentCode: "1000" },
  { code: "1210", name: "Computer Equipment",          type: "asset",     subType: "fixed_asset",         isSystem: false, parentCode: "1200" },
  { code: "1220", name: "Furniture & Fixtures",        type: "asset",     subType: "fixed_asset",         isSystem: false, parentCode: "1200" },
  { code: "1290", name: "Accumulated Depreciation",    type: "contra_asset", subType: "accumulated_depreciation", isSystem: false, parentCode: "1200" },
  // ── Liabilities
  { code: "2000", name: "Liabilities",                 type: "liability", subType: "other_current_liability", isSystem: true, parentCode: null },
  { code: "2100", name: "Current Liabilities",         type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2000" },
  { code: "2110", name: "Accounts Payable (Trade)",    type: "liability", subType: "accounts_payable",        isSystem: true, parentCode: "2100" },
  { code: "2120", name: "GST Payable",                 type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2100" },
  { code: "2121", name: "IGST Payable",                type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2120" },
  { code: "2122", name: "CGST Payable",                type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2120" },
  { code: "2123", name: "SGST Payable",                type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2120" },
  { code: "2130", name: "TDS Payable",                 type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2100" },
  { code: "2140", name: "PF Payable",                  type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2100" },
  { code: "2150", name: "Salary & Wages Payable",      type: "liability", subType: "other_current_liability", isSystem: false, parentCode: "2100" },
  { code: "2200", name: "Long-Term Liabilities",       type: "liability", subType: "long_term_liability",     isSystem: false, parentCode: "2000" },
  // ── Equity
  { code: "3000", name: "Equity",                      type: "equity",    subType: "owners_equity",       isSystem: true, parentCode: null },
  { code: "3100", name: "Share Capital",               type: "equity",    subType: "share_capital",       isSystem: false, parentCode: "3000" },
  { code: "3200", name: "Retained Earnings",           type: "equity",    subType: "retained_earnings",   isSystem: true, parentCode: "3000" },
  // ── Income
  { code: "4000", name: "Income",                      type: "income",    subType: "income",              isSystem: true, parentCode: null },
  { code: "4100", name: "Revenue from Operations",     type: "income",    subType: "income",              isSystem: true, parentCode: "4000" },
  { code: "4110", name: "Service Revenue",             type: "income",    subType: "income",              isSystem: false, parentCode: "4100" },
  { code: "4120", name: "Product Sales",               type: "income",    subType: "income",              isSystem: false, parentCode: "4100" },
  { code: "4200", name: "Other Income",                type: "income",    subType: "other_income",        isSystem: false, parentCode: "4000" },
  { code: "4210", name: "Interest Income",             type: "income",    subType: "other_income",        isSystem: false, parentCode: "4200" },
  // ── Expenses
  { code: "5000", name: "Expenses",                    type: "expense",   subType: "expense",             isSystem: true, parentCode: null },
  { code: "5100", name: "Cost of Revenue",             type: "expense",   subType: "cost_of_goods_sold",  isSystem: false, parentCode: "5000" },
  { code: "5200", name: "Personnel Costs",             type: "expense",   subType: "payroll_expense",     isSystem: false, parentCode: "5000" },
  { code: "5210", name: "Salaries & Wages",            type: "expense",   subType: "payroll_expense",     isSystem: false, parentCode: "5200" },
  { code: "5220", name: "PF / ESI Employer",           type: "expense",   subType: "payroll_expense",     isSystem: false, parentCode: "5200" },
  { code: "5300", name: "Office & Admin Expenses",     type: "expense",   subType: "expense",             isSystem: false, parentCode: "5000" },
  { code: "5400", name: "Travel & Entertainment",      type: "expense",   subType: "expense",             isSystem: false, parentCode: "5000" },
  { code: "5500", name: "Depreciation",                type: "expense",   subType: "depreciation",        isSystem: true, parentCode: "5000" },
  { code: "5600", name: "Finance Charges",             type: "expense",   subType: "expense",             isSystem: false, parentCode: "5000" },
] as const;

// ── Router ─────────────────────────────────────────────────────────────────

export const accountingRouter = router({

  // ── Chart of Accounts ──────────────────────────────────────────────────

  coa: router({
    list: permissionProcedure("financial", "read").input(z.object({
      type: z.string().optional(),
      activeOnly: z.boolean().default(true),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { chartOfAccounts, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const conds: any[] = [dbEq(chartOfAccounts.orgId, org!.id)];
      if (input.activeOnly) conds.push(dbEq(chartOfAccounts.isActive, true));
      if (input.type) conds.push(dbEq(chartOfAccounts.type, input.type as any));
      return db.select().from(chartOfAccounts).where(dbAnd(...conds));
    }),

    create: permissionProcedure("financial", "write").input(z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(200),
      type: z.enum(["asset", "liability", "equity", "income", "expense", "contra_asset", "contra_liability", "contra_equity", "contra_income", "contra_expense"]),
      subType: z.string().optional(),
      parentId: z.string().uuid().optional(),
      description: z.string().optional(),
      currency: z.string().default("INR"),
      openingBalance: z.number().default(0),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { chartOfAccounts } = await import("@nexusops/db");
      const [acct] = await db.insert(chartOfAccounts).values({
        ...input,
        orgId: org!.id,
        openingBalance: String(input.openingBalance),
        currentBalance: String(input.openingBalance),
        subType: input.subType as any,
      }).returning();
      return acct!;
    }),

    update: permissionProcedure("financial", "write").input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { chartOfAccounts, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const { id, ...updates } = input;
      const [acct] = await db.update(chartOfAccounts).set({ ...updates, updatedAt: new Date() })
        .where(dbAnd(dbEq(chartOfAccounts.id, id), dbEq(chartOfAccounts.orgId, org!.id))).returning();
      return acct!;
    }),

    /** Seed standard India COA (idempotent). */
    seed: permissionProcedure("financial", "write").mutation(async ({ ctx }) => {
      const { org, db } = ctx;
      const { chartOfAccounts } = await import("@nexusops/db");
      // Build id map for parent resolution
      const existing = await db.select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
        .from(chartOfAccounts).where((await import("@nexusops/db")).eq(chartOfAccounts.orgId, org!.id));
      const codeToId = new Map<string, string>(existing.map(r => [r.code, r.id]));

      let seeded = 0;
      for (const acct of INDIA_COA_SEED) {
        if (codeToId.has(acct.code)) continue;
        const parentId = acct.parentCode ? (codeToId.get(acct.parentCode) ?? undefined) : undefined;
        const [inserted] = await db.insert(chartOfAccounts).values({
          orgId: org!.id,
          code: acct.code,
          name: acct.name,
          type: acct.type as any,
          subType: acct.subType as any,
          parentId,
          isSystem: acct.isSystem,
          openingBalance: "0",
          currentBalance: "0",
        }).returning();
        if (inserted) codeToId.set(acct.code, inserted.id);
        seeded++;
      }
      return { seeded, total: INDIA_COA_SEED.length };
    }),
  }),

  // ── Journal Entries ──────────────────────────────────────────────────────

  journal: router({
    list: permissionProcedure("financial", "read").input(z.object({
      status: z.string().optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      accountId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { journalEntries, journalEntryLines, chartOfAccounts, eq: dbEq, and: dbAnd, desc: dbDesc, gte, lte } = await import("@nexusops/db");
      const conds: any[] = [dbEq(journalEntries.orgId, org!.id)];
      if (input.status) conds.push(dbEq(journalEntries.status, input.status as any));
      if (input.startDate) conds.push(gte(journalEntries.date, input.startDate));
      if (input.endDate) conds.push(lte(journalEntries.date, input.endDate));

      const entries = await db.select().from(journalEntries)
        .where(dbAnd(...conds)).orderBy(dbDesc(journalEntries.date)).limit(input.limit).offset(input.offset);

      if (entries.length === 0) return { items: [], total: 0 };

      const ids = entries.map(e => e.id);
      const { inArray: dbInArray } = await import("@nexusops/db");
      const lines = await db.select({ line: journalEntryLines, account: chartOfAccounts })
        .from(journalEntryLines)
        .leftJoin(chartOfAccounts, dbEq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(dbInArray(journalEntryLines.journalEntryId, ids));

      const { count: dbCount } = await import("@nexusops/db");
      const [total] = await db.select({ n: dbCount() }).from(journalEntries).where(dbAnd(...conds));

      return {
        items: entries.map(e => ({ ...e, lines: lines.filter(l => l.line.journalEntryId === e.id) })),
        total: total?.n ?? 0,
      };
    }),

    create: permissionProcedure("financial", "write").input(z.object({
      date: z.coerce.date(),
      description: z.string().min(1),
      reference: z.string().optional(),
      type: z.enum(["manual", "invoice", "payment", "payroll", "depreciation", "closing", "opening", "reversal", "gst_liability", "tds_deduction"]).default("manual"),
      currency: z.string().default("INR"),
      financialYear: z.string().optional(),
      lines: z.array(z.object({
        accountId: z.string().uuid(),
        debitAmount: z.number().min(0).default(0),
        creditAmount: z.number().min(0).default(0),
        description: z.string().optional(),
      })).min(2),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, userId } = ctx;
      const { journalEntries, journalEntryLines, count: dbCount, eq: dbEq } = await import("@nexusops/db");

      // Validate balanced entry
      const totalDebit  = input.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit}` });
      }

      // Generate JE number
      const [c] = await db.select({ n: dbCount() }).from(journalEntries).where(dbEq(journalEntries.orgId, org!.id));
      const seq = (c?.n ?? 0) + 1;
      const number = `JE-${input.date.getFullYear()}-${String(seq).padStart(5, "0")}`;
      const fy = input.financialYear ?? currentFY(input.date);

      const [je] = await db.insert(journalEntries).values({
        orgId: org!.id,
        number,
        date: input.date,
        type: input.type,
        status: "draft",
        description: input.description,
        reference: input.reference,
        currency: input.currency,
        totalDebit: String(totalDebit),
        totalCredit: String(totalCredit),
        createdById: userId,
        financialYear: fy,
        period: input.date.getMonth() + 1,
      }).returning();

      const lineRows = input.lines.map((l, i) => ({
        journalEntryId: je!.id,
        orgId: org!.id,
        accountId: l.accountId,
        debitAmount: String(l.debitAmount),
        creditAmount: String(l.creditAmount),
        description: l.description,
        sortOrder: i,
      }));
      await db.insert(journalEntryLines).values(lineRows);
      return je!;
    }),

    post: permissionProcedure("financial", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db, userId } = ctx;
      const { journalEntries, journalEntryLines, chartOfAccounts, eq: dbEq, and: dbAnd, sql } = await import("@nexusops/db");

      const [je] = await db.select().from(journalEntries)
        .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id))).limit(1);
      if (!je) throw new TRPCError({ code: "NOT_FOUND" });
      if (je.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft entries can be posted" });

      const lines = await db.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));

      // Update account running balances
      for (const line of lines) {
        const net = Number(line.debitAmount) - Number(line.creditAmount);
        await db.update(chartOfAccounts)
          .set({ currentBalance: sql`current_balance + ${String(net)}`, updatedAt: new Date() })
          .where(dbEq(chartOfAccounts.id, line.accountId));
      }

      const [posted] = await db.update(journalEntries).set({
        status: "posted",
        postedById: userId,
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(dbEq(journalEntries.id, je.id)).returning();
      return posted!;
    }),

    reverse: permissionProcedure("financial", "write").input(z.object({
      id: z.string().uuid(),
      date: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, userId } = ctx;
      const { journalEntries, journalEntryLines, count: dbCount, eq: dbEq, and: dbAnd } = await import("@nexusops/db");

      const [je] = await db.select().from(journalEntries)
        .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id))).limit(1);
      if (!je) throw new TRPCError({ code: "NOT_FOUND" });
      if (je.status !== "posted") throw new TRPCError({ code: "BAD_REQUEST", message: "Only posted entries can be reversed" });

      const lines = await db.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));
      const revDate = input.date ?? new Date();

      const [c] = await db.select({ n: dbCount() }).from(journalEntries).where(dbEq(journalEntries.orgId, org!.id));
      const seq = (c?.n ?? 0) + 1;
      const revNumber = `JE-${revDate.getFullYear()}-${String(seq).padStart(5, "0")}-REV`;

      const [revJe] = await db.insert(journalEntries).values({
        orgId: org!.id,
        number: revNumber,
        date: revDate,
        type: "reversal",
        status: "posted",
        description: `Reversal of ${je.number}`,
        reference: je.number,
        currency: je.currency,
        totalDebit: je.totalCredit,
        totalCredit: je.totalDebit,
        createdById: userId,
        postedById: userId,
        postedAt: revDate,
        reversalOfId: je.id,
        financialYear: currentFY(revDate),
        period: revDate.getMonth() + 1,
      }).returning();

      const revLines = lines.map((l, i) => ({
        journalEntryId: revJe!.id,
        orgId: org!.id,
        accountId: l.accountId,
        debitAmount: l.creditAmount,
        creditAmount: l.debitAmount,
        description: l.description,
        sortOrder: i,
      }));
      await db.insert(journalEntryLines).values(revLines);

      await db.update(journalEntries).set({ status: "reversed", updatedAt: new Date() }).where(dbEq(journalEntries.id, je.id));
      return revJe!;
    }),
  }),

  // ── Ledger & Reports ────────────────────────────────────────────────────

  /** General Ledger for an account */
  ledger: permissionProcedure("financial", "read").input(z.object({
    accountId: z.string().uuid(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { journalEntryLines, journalEntries, chartOfAccounts, eq: dbEq, and: dbAnd, gte, lte, asc: dbAsc } = await import("@nexusops/db");

    const [acct] = await db.select().from(chartOfAccounts)
      .where(dbAnd(dbEq(chartOfAccounts.id, input.accountId), dbEq(chartOfAccounts.orgId, org!.id))).limit(1);
    if (!acct) throw new TRPCError({ code: "NOT_FOUND" });

    const conds: any[] = [dbEq(journalEntryLines.accountId, input.accountId), dbEq(journalEntryLines.orgId, org!.id)];
    const joinConds: any[] = [];
    if (input.startDate) joinConds.push(gte(journalEntries.date, input.startDate));
    if (input.endDate)   joinConds.push(lte(journalEntries.date, input.endDate));

    const lines = await db.select({ line: journalEntryLines, je: journalEntries })
      .from(journalEntryLines)
      .innerJoin(journalEntries, dbAnd(dbEq(journalEntryLines.journalEntryId, journalEntries.id), dbEq(journalEntries.status, "posted"), ...joinConds))
      .where(dbAnd(...conds))
      .orderBy(dbAsc(journalEntries.date));

    let balance = Number(acct.openingBalance);
    const rows = lines.map(r => {
      const net = Number(r.line.debitAmount) - Number(r.line.creditAmount);
      balance += net;
      return { ...r, runningBalance: balance };
    });

    return { account: acct, openingBalance: Number(acct.openingBalance), lines: rows, closingBalance: balance };
  }),

  /** Trial Balance */
  trialBalance: permissionProcedure("financial", "read").input(z.object({
    financialYear: z.string().optional(),
    asOfDate: z.coerce.date().optional(),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { chartOfAccounts, eq: dbEq } = await import("@nexusops/db");

    const accounts = await db.select().from(chartOfAccounts)
      .where(dbEq(chartOfAccounts.orgId, org!.id));

    const totalDebit  = accounts.filter(a => Number(a.currentBalance) > 0).reduce((s, a) => s + Number(a.currentBalance), 0);
    const totalCredit = accounts.filter(a => Number(a.currentBalance) < 0).reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      lines: accounts.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit: Number(a.currentBalance) > 0 ? Number(a.currentBalance) : 0,
        credit: Number(a.currentBalance) < 0 ? Math.abs(Number(a.currentBalance)) : 0,
      })),
      totalDebit,
      totalCredit,
      isBalanced,
    };
  }),

  /** Income Statement (P&L) */
  incomeStatement: permissionProcedure("financial", "read").input(z.object({
    financialYear: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })).query(async ({ ctx }) => {
    const { org, db } = ctx;
    const { chartOfAccounts, eq: dbEq } = await import("@nexusops/db");

    const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));
    const income   = accounts.filter(a => a.type === "income");
    const expenses = accounts.filter(a => a.type === "expense");

    const totalIncome   = income.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    const totalExpenses = expenses.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    const netProfit     = totalIncome - totalExpenses;

    return { income, expenses, totalIncome, totalExpenses, netProfit };
  }),

  // ── GSTIN Registry ───────────────────────────────────────────────────────

  gstin: router({
    list: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      const { org, db } = ctx;
      const { gstinRegistry, eq: dbEq } = await import("@nexusops/db");
      return db.select().from(gstinRegistry).where(dbEq(gstinRegistry.orgId, org!.id));
    }),

    create: permissionProcedure("financial", "write").input(z.object({
      gstin: z.string().length(15).regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format"),
      legalName: z.string().min(1),
      tradeName: z.string().optional(),
      stateCode: z.string().length(2),
      stateName: z.string().optional(),
      address: z.string().optional(),
      registrationDate: z.coerce.date().optional(),
      isPrimary: z.boolean().default(false),
      invoiceSeriesPrefix: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstinRegistry, eq: dbEq } = await import("@nexusops/db");
      if (input.isPrimary) {
        // Demote all others
        await db.update(gstinRegistry).set({ isPrimary: false }).where(dbEq(gstinRegistry.orgId, org!.id));
      }
      const [gstin] = await db.insert(gstinRegistry).values({ ...input, orgId: org!.id }).returning();
      return gstin!;
    }),

    update: permissionProcedure("financial", "write").input(z.object({
      id: z.string().uuid(),
      tradeName: z.string().optional(),
      address: z.string().optional(),
      isActive: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      invoiceSeriesPrefix: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstinRegistry, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const { id, isPrimary, ...rest } = input;
      if (isPrimary) {
        await db.update(gstinRegistry).set({ isPrimary: false }).where(dbEq(gstinRegistry.orgId, org!.id));
      }
      const [g] = await db.update(gstinRegistry).set({ ...rest, ...(isPrimary !== undefined ? { isPrimary } : {}), updatedAt: new Date() })
        .where(dbAnd(dbEq(gstinRegistry.id, id), dbEq(gstinRegistry.orgId, org!.id))).returning();
      return g!;
    }),
  }),

  // ── GSTR Generation ─────────────────────────────────────────────────────

  gstr: router({
    /** Generate GSTR-1 JSON from invoices table for a given GSTIN + period */
    generateGSTR1: permissionProcedure("financial", "read").input(z.object({
      gstinId: z.string().uuid(),
      month: z.number().int().min(1).max(12),
      year: z.number().int(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { invoices, gstinRegistry, eq: dbEq, and: dbAnd, gte, lte } = await import("@nexusops/db");
      const [gstin] = await db.select().from(gstinRegistry)
        .where(dbAnd(dbEq(gstinRegistry.id, input.gstinId), dbEq(gstinRegistry.orgId, org!.id))).limit(1);
      if (!gstin) throw new TRPCError({ code: "NOT_FOUND" });

      const start = new Date(input.year, input.month - 1, 1);
      const end   = new Date(input.year, input.month, 0, 23, 59, 59);

      const invs = await db.select().from(invoices)
        .where(dbAnd(dbEq(invoices.orgId, org!.id), gte(invoices.invoiceDate, start), lte(invoices.invoiceDate, end)));

      const b2b: any[] = [];
      const b2c: any[] = [];

      for (const inv of invs as any[]) {
        const igst = Number(inv.igstAmount ?? 0);
        const cgst = Number(inv.cgstAmount ?? 0);
        const sgst = Number(inv.sgstAmount ?? 0);
        const taxableValue = Number(inv.taxableValue ?? 0);

        const entry = {
          inum: inv.invoiceNumber,
          idt: new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
          val: Number(inv.totalAmount ?? 0),
          pos: inv.placeOfSupply ?? gstin.stateCode,
          rchrg: (inv.isReverseCharge ?? false) ? "Y" : "N",
          itms: [{ num: 1, itm_det: { rt: 18, txval: taxableValue, iamt: igst, camt: cgst, samt: sgst, csamt: 0 } }],
        };

        if (inv.buyerGstin) {
          const existing = b2b.find((g: any) => g.ctin === inv.buyerGstin);
          if (existing) {
            existing.inv.push(entry);
          } else {
            b2b.push({ ctin: inv.buyerGstin, inv: [entry] });
          }
        } else {
          b2c.push({ ...entry, ty: "B2CS" });
        }
      }

      const gstp_cd = `${input.month.toString().padStart(2, "0")}${input.year}`;
      const payload = {
        gstin: gstin.gstin,
        fp: gstp_cd,
        b2b,
        b2cs: b2c,
        nil: { inv: [] },
        exp: { expwp: [], expwop: [] },
        b2ba: [],
      };

      return { payload, invoiceCount: invs.length, gstin: gstin.gstin, period: `${input.month}/${input.year}` };
    }),

    /** Generate GSTR-3B summary return for a period */
    generateGSTR3B: permissionProcedure("financial", "read").input(z.object({
      gstinId: z.string().uuid(),
      month: z.number().int().min(1).max(12),
      year: z.number().int(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { invoices, gstinRegistry, eq: dbEq, and: dbAnd, gte, lte, sum } = await import("@nexusops/db");
      const [gstin] = await db.select().from(gstinRegistry)
        .where(dbAnd(dbEq(gstinRegistry.id, input.gstinId), dbEq(gstinRegistry.orgId, org!.id))).limit(1);
      if (!gstin) throw new TRPCError({ code: "NOT_FOUND" });

      const start = new Date(input.year, input.month - 1, 1);
      const end   = new Date(input.year, input.month, 0, 23, 59, 59);

      // Outward supplies (from invoices)
      const [outward] = await db.select({
        taxable: sum(invoices.taxableValue),
        igst:    sum(invoices.igstAmount),
        cgst:    sum(invoices.cgstAmount),
        sgst:    sum(invoices.sgstAmount),
      }).from(invoices).where(dbAnd(dbEq(invoices.orgId, org!.id), gte(invoices.invoiceDate, start), lte(invoices.invoiceDate, end)));

      // ITC (from purchase bills — approximate from COA balance for now)
      const outputIGST = Number(outward?.igst ?? 0);
      const outputCGST = Number(outward?.cgst ?? 0);
      const outputSGST = Number(outward?.sgst ?? 0);
      const totalOutputTax = outputIGST + outputCGST + outputSGST;

      const payload = {
        gstin: gstin.gstin,
        ret_period: `${input.month.toString().padStart(2, "0")}${input.year}`,
        "3_1": {
          desc: "Outward taxable supplies (other than zero rated, nil and exempted)",
          osup_det: { txval: Number(outward?.taxable ?? 0), iamt: outputIGST, camt: outputCGST, samt: outputSGST, csamt: 0 },
        },
        "4": {
          desc: "Eligible ITC",
          itc_avl: { osup_det: { iamt: 0, camt: 0, samt: 0, csamt: 0 } },
        },
        "5_1": {
          desc: "Interest and late fee payable",
          intr_lt_fee: { intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 } },
        },
      };

      return {
        payload,
        summary: { outputIGST, outputCGST, outputSGST, totalOutputTax, netPayable: totalOutputTax },
        gstin: gstin.gstin,
        period: `${input.month}/${input.year}`,
      };
    }),
  }),
});
