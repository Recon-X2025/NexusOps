/**
 * Accounting Router
 * Covers: Chart of Accounts, Journal Entries, General Ledger, Trial Balance,
 *         Balance Sheet, P&L, GSTR-1 / GSTR-3B generation, GSTIN registry
 */

import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { InferSelectModel } from "drizzle-orm";
import type { SQL } from "@coheronconnect/db";
import {
  chartOfAccounts as chartOfAccountsTbl,
  journalEntries as journalEntriesTbl,
  journalEntryLines as journalEntryLinesTbl,
  accountTypeEnum,
  accountSubTypeEnum,
  journalEntryStatusEnum,
} from "@coheronconnect/db";

type CoaRow = InferSelectModel<typeof chartOfAccountsTbl>;
type JeRow = InferSelectModel<typeof journalEntriesTbl>;
type JelRow = InferSelectModel<typeof journalEntryLinesTbl>;
type JournalLineWithAcct = { line: JelRow; account: CoaRow | null };
type LedgerLineRow = { line: JelRow; je: JeRow };

// ── Helpers ────────────────────────────────────────────────────────────────

export function currentFY(date: Date = new Date()): string {
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
      type: z.enum(accountTypeEnum.enumValues).optional(),
      activeOnly: z.boolean().default(true),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { chartOfAccounts, eq: dbEq, and: dbAnd, asc: dbAsc } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(chartOfAccounts.orgId, org!.id)];
      if (input.activeOnly) conds.push(dbEq(chartOfAccounts.isActive, true));
      if (input.type) conds.push(dbEq(chartOfAccounts.type, input.type));
      return db.select().from(chartOfAccounts).where(dbAnd(...conds))
        .orderBy(dbAsc(chartOfAccounts.code))
        .limit(input.limit).offset(input.offset);
    }),

    create: permissionProcedure("financial", "write").input(z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(200),
      type: z.enum(accountTypeEnum.enumValues),
      subType: z.enum(accountSubTypeEnum.enumValues).optional(),
      parentId: z.string().uuid().optional(),
      description: z.string().optional(),
      currency: z.string().default("INR"),
      openingBalance: z.number().default(0),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { chartOfAccounts } = await import("@coheronconnect/db");
      const [acct] = await db.insert(chartOfAccounts).values({
        ...input,
        orgId: org!.id,
        openingBalance: String(input.openingBalance),
        currentBalance: String(input.openingBalance),
        subType: input.subType,
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
      const { chartOfAccounts, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const { id, ...updates } = input;
      const [acct] = await db.update(chartOfAccounts).set({ ...updates, updatedAt: new Date() })
        .where(dbAnd(dbEq(chartOfAccounts.id, id), dbEq(chartOfAccounts.orgId, org!.id))).returning();
      return acct!;
    }),

    /** Seed standard India COA (idempotent). */
    seed: permissionProcedure("financial", "write").input(z.object({}).optional()).mutation(async ({ ctx }) => {
      const { org, db } = ctx;
      const { chartOfAccounts, eq: dbEq } = await import("@coheronconnect/db");
      try {
        // Build id map for parent resolution
        const existing = await db
          .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
          .from(chartOfAccounts)
          .where(dbEq(chartOfAccounts.orgId, org!.id));
        const codeToId = new Map<string, string>(existing.map((r) => [r.code, r.id]));

        let seeded = 0;
        for (const acct of INDIA_COA_SEED) {
          if (codeToId.has(acct.code)) continue;
          const parentId = acct.parentCode ? (codeToId.get(acct.parentCode) ?? undefined) : undefined;
          const [inserted] = await db
            .insert(chartOfAccounts)
            .values({
              orgId: org!.id,
              code: acct.code,
              name: acct.name,
              type: acct.type,
              subType: acct.subType,
              parentId,
              isSystem: acct.isSystem,
              openingBalance: "0",
              currentBalance: "0",
            })
            .returning();
          if (inserted) codeToId.set(acct.code, inserted.id);
          seeded++;
        }
        return { seeded, total: INDIA_COA_SEED.length };
      } catch (e: unknown) {
        const err = e as { code?: string; cause?: { code?: string }; message?: string };
        const code = err?.cause?.code ?? err?.code;
        const msg = err?.message ?? String(e);
        if (code === "42P01" || msg.includes("chart_of_accounts")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Accounting tables are missing. From the repo root run: pnpm --filter @coheronconnect/db db:migrate " +
              "(or `pnpm db:migrate`). Ensure DATABASE_URL points at your Postgres instance.",
          });
        }
        throw e;
      }
    }),
  }),

  // ── Journal Entries ──────────────────────────────────────────────────────

  journal: router({
    list: permissionProcedure("financial", "read").input(z.object({
      status: z.enum(journalEntryStatusEnum.enumValues).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      accountId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { journalEntries, journalEntryLines, chartOfAccounts, eq: dbEq, and: dbAnd, desc: dbDesc, gte, lte } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(journalEntries.orgId, org!.id)];
      if (input.status) conds.push(dbEq(journalEntries.status, input.status));
      if (input.startDate) conds.push(gte(journalEntries.date, input.startDate));
      if (input.endDate) conds.push(lte(journalEntries.date, input.endDate));

      const entries = await db.select().from(journalEntries)
        .where(dbAnd(...conds)).orderBy(dbDesc(journalEntries.date)).limit(input.limit).offset(input.offset);

      if (entries.length === 0) return { items: [], total: 0 };

      const ids = entries.map((e: JeRow) => e.id);
      const { inArray: dbInArray } = await import("@coheronconnect/db");
      const lines = await db.select({ line: journalEntryLines, account: chartOfAccounts })
        .from(journalEntryLines)
        .leftJoin(chartOfAccounts, dbEq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(dbInArray(journalEntryLines.journalEntryId, ids));

      const { count: dbCount } = await import("@coheronconnect/db");
      const [total] = await db.select({ n: dbCount() }).from(journalEntries).where(dbAnd(...conds));

      return {
        items: entries.map((e: JeRow) => ({
          ...e,
          lines: lines.filter((l: JournalLineWithAcct) => l.line.journalEntryId === e.id),
        })),
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
      const { org, db, user } = ctx;
      const { journalEntries, journalEntryLines, count: dbCount, eq: dbEq } = await import("@coheronconnect/db");

      // Validate balanced entry
      const totalDebit  = input.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit}` });
      }

      const fy = input.financialYear ?? currentFY(input.date);

      // Header + lines are one entry; do them in a transaction so a line-insert
      // failure can't leave a header with no (or partial) line items, and so the
      // JE-number sequence read can't race a concurrent create.
      return await db.transaction(async (tx) => {
        const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(dbEq(journalEntries.orgId, org!.id));
        const seq = (c?.n ?? 0) + 1;
        const number = `JE-${input.date.getFullYear()}-${String(seq).padStart(5, "0")}`;

        const [je] = await tx.insert(journalEntries).values({
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
          createdById: user!.id,
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
        await tx.insert(journalEntryLines).values(lineRows);
        return je!;
      });
    }),

    post: permissionProcedure("financial", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { journalEntries, journalEntryLines, chartOfAccounts, eq: dbEq, and: dbAnd, sql } = await import("@coheronconnect/db");

      const [je] = await db.select().from(journalEntries)
        .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id))).limit(1);
      if (!je) throw new TRPCError({ code: "NOT_FOUND" });
      if (je.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft entries can be posted" });

      const lines = await db.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));

      // Balance updates and the status flip must be atomic: a mid-loop failure
      // would corrupt account running balances while leaving the entry "draft".
      return await db.transaction(async (tx) => {
        for (const line of lines) {
          const net = Number(line.debitAmount) - Number(line.creditAmount);
          await tx.update(chartOfAccounts)
            .set({ currentBalance: sql`current_balance + ${String(net)}`, updatedAt: new Date() })
            .where(dbEq(chartOfAccounts.id, line.accountId));
        }

        const [posted] = await tx.update(journalEntries).set({
          status: "posted",
          postedById: user!.id,
          postedAt: new Date(),
          updatedAt: new Date(),
        }).where(dbEq(journalEntries.id, je.id)).returning();
        return posted!;
      });
    }),

    reverse: permissionProcedure("financial", "write").input(z.object({
      id: z.string().uuid(),
      date: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { journalEntries, journalEntryLines, chartOfAccounts, count: dbCount, eq: dbEq, and: dbAnd, sql } = await import("@coheronconnect/db");

      const [je] = await db.select().from(journalEntries)
        .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id))).limit(1);
      if (!je) throw new TRPCError({ code: "NOT_FOUND" });
      if (je.status !== "posted") throw new TRPCError({ code: "BAD_REQUEST", message: "Only posted entries can be reversed" });

      const lines = await db.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));
      const revDate = input.date ?? new Date();

      // The reversal header, its lines, and flipping the original to "reversed"
      // are one accounting event: a partial write would leave a half-reversed
      // entry or an orphaned reversal in the ledger.
      return await db.transaction(async (tx) => {
        const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(dbEq(journalEntries.orgId, org!.id));
        const seq = (c?.n ?? 0) + 1;
        const revNumber = `JE-${revDate.getFullYear()}-${String(seq).padStart(5, "0")}-REV`;

        const [revJe] = await tx.insert(journalEntries).values({
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
          createdById: user!.id,
          postedById: user!.id,
          postedAt: revDate,
          reversalOfId: je.id,
          financialYear: currentFY(revDate),
          period: revDate.getMonth() + 1,
        }).returning();

        const revLines = lines.map((l: JelRow, i: number) => ({
          journalEntryId: revJe!.id,
          orgId: org!.id,
          accountId: l.accountId,
          debitAmount: l.creditAmount,
          creditAmount: l.debitAmount,
          description: l.description,
          sortOrder: i,
        }));
        await tx.insert(journalEntryLines).values(revLines);

        // A reversal is itself a posted entry, so it must move balances too —
        // otherwise the ledger stays skewed by the original posting. Applying
        // net = debit − credit to the reversal lines (which have debit/credit
        // swapped) exactly undoes the original post()'s balance impact.
        for (const line of revLines) {
          const net = Number(line.debitAmount) - Number(line.creditAmount);
          await tx.update(chartOfAccounts)
            .set({ currentBalance: sql`current_balance + ${String(net)}`, updatedAt: new Date() })
            .where(dbEq(chartOfAccounts.id, line.accountId));
        }

        await tx.update(journalEntries).set({ status: "reversed", updatedAt: new Date() }).where(dbEq(journalEntries.id, je.id));
        return revJe!;
      });
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
    const { journalEntryLines, journalEntries, chartOfAccounts, eq: dbEq, and: dbAnd, gte, lte, asc: dbAsc } = await import("@coheronconnect/db");

    const [acct] = await db.select().from(chartOfAccounts)
      .where(dbAnd(dbEq(chartOfAccounts.id, input.accountId), dbEq(chartOfAccounts.orgId, org!.id))).limit(1);
    if (!acct) throw new TRPCError({ code: "NOT_FOUND" });

    const conds: SQL[] = [dbEq(journalEntryLines.accountId, input.accountId), dbEq(journalEntryLines.orgId, org!.id)];
    const joinConds: SQL[] = [];
    if (input.startDate) joinConds.push(gte(journalEntries.date, input.startDate));
    if (input.endDate)   joinConds.push(lte(journalEntries.date, input.endDate));

    const lines = await db.select({ line: journalEntryLines, je: journalEntries })
      .from(journalEntryLines)
      .innerJoin(journalEntries, dbAnd(dbEq(journalEntryLines.journalEntryId, journalEntries.id), dbEq(journalEntries.status, "posted"), ...joinConds))
      .where(dbAnd(...conds))
      .orderBy(dbAsc(journalEntries.date));

    let balance = Number(acct.openingBalance);
    const rows = lines.map((r: LedgerLineRow) => {
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
    const { chartOfAccounts, eq: dbEq } = await import("@coheronconnect/db");

    const accounts = await db.select().from(chartOfAccounts)
      .where(dbEq(chartOfAccounts.orgId, org!.id));

    const totalDebit  = accounts.filter((a: CoaRow) => Number(a.currentBalance) > 0).reduce((s: number, a: CoaRow) => s + Number(a.currentBalance), 0);
    const totalCredit = accounts.filter((a: CoaRow) => Number(a.currentBalance) < 0).reduce((s: number, a: CoaRow) => s + Math.abs(Number(a.currentBalance)), 0);
    const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      lines: accounts.map((a: CoaRow) => ({
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
    const { chartOfAccounts, eq: dbEq } = await import("@coheronconnect/db");

    const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));
    const income   = accounts.filter((a: CoaRow) => a.type === "income");
    const expenses = accounts.filter((a: CoaRow) => a.type === "expense");

    const totalIncome   = income.reduce((s: number, a: CoaRow) => s + Math.abs(Number(a.currentBalance)), 0);
    const totalExpenses = expenses.reduce((s: number, a: CoaRow) => s + Math.abs(Number(a.currentBalance)), 0);
    const netProfit     = totalIncome - totalExpenses;

    return { income, expenses, totalIncome, totalExpenses, netProfit };
  }),

  /**
   * Profit & Loss for a date range — the *period-accurate* P&L.
   *
   * Unlike `incomeStatement` (which reads the `currentBalance` snapshot and so
   * always reflects inception-to-date), this sums the movements on posted
   * journal-entry lines whose entry date falls in [startDate, endDate]. Each
   * line's net movement is `debit − credit`; for a credit-normal income account
   * that net is negative, so revenue is surfaced as `−net` and expense as `net`.
   * This is the query the balance-sheet rollup uses for current-period earnings.
   */
  profitAndLoss: permissionProcedure("financial", "read").input(z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { chartOfAccounts, journalEntries, journalEntryLines, eq: dbEq, and: dbAnd, gte, lte, sql: dbSql } = await import("@coheronconnect/db");

    // Sum posted line movements per account within the window.
    const rows = await db
      .select({
        accountId: journalEntryLines.accountId,
        net: dbSql<string>`coalesce(sum(${journalEntryLines.debitAmount} - ${journalEntryLines.creditAmount}), 0)`,
      })
      .from(journalEntryLines)
      .innerJoin(
        journalEntries,
        dbAnd(
          dbEq(journalEntryLines.journalEntryId, journalEntries.id),
          dbEq(journalEntries.status, "posted"),
          gte(journalEntries.date, input.startDate),
          lte(journalEntries.date, input.endDate),
        ),
      )
      .where(dbEq(journalEntryLines.orgId, org!.id))
      .groupBy(journalEntryLines.accountId);

    const netByAccount = new Map<string, number>();
    for (const r of rows) netByAccount.set(r.accountId, Number(r.net));

    const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));

    // Income is credit-normal (net ≤ 0 → revenue = −net); expense is debit-normal.
    const income = accounts
      .filter((a: CoaRow) => a.type === "income" || a.type === "contra_income")
      .map((a: CoaRow) => ({ id: a.id, code: a.code, name: a.name, subType: a.subType, amount: -(netByAccount.get(a.id) ?? 0) }))
      .filter((a) => a.amount !== 0);
    const expenses = accounts
      .filter((a: CoaRow) => a.type === "expense" || a.type === "contra_expense")
      .map((a: CoaRow) => ({ id: a.id, code: a.code, name: a.name, subType: a.subType, amount: netByAccount.get(a.id) ?? 0 }))
      .filter((a) => a.amount !== 0);

    const totalIncome   = income.reduce((s, a) => s + a.amount, 0);
    const totalExpenses = expenses.reduce((s, a) => s + a.amount, 0);
    const netProfit     = totalIncome - totalExpenses;

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netProfit,
    };
  }),

  /**
   * Balance Sheet as at a date — Assets = Liabilities + Equity.
   *
   * Balances are taken from the `currentBalance` snapshot (opening + all posted
   * movements to date), grouped by section. Because the accounting identity only
   * closes once P&L is swept to retained earnings, the *net income to date*
   * (income − expense) is folded into equity as a synthetic "Current Period
   * Earnings" line so the sheet balances without requiring a period-close entry.
   * Contra-asset balances (e.g. accumulated depreciation) net down assets.
   */
  balanceSheet: permissionProcedure("financial", "read").input(z.object({
    asOfDate: z.coerce.date().optional(),
  }).optional()).query(async ({ ctx }) => {
    const { org, db } = ctx;
    const { chartOfAccounts, eq: dbEq } = await import("@coheronconnect/db");

    const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));

    const section = (a: CoaRow) => ({
      id: a.id, code: a.code, name: a.name, type: a.type, subType: a.subType,
      balance: Number(a.currentBalance),
    });

    // Assets are debit-normal (balance ≥ 0 typical); contra-assets are credit-
    // normal and reduce the asset total. Present both, net at the total.
    const assetRows = accounts.filter((a: CoaRow) => a.type === "asset" || a.type === "contra_asset").map(section);
    const liabilityRows = accounts.filter((a: CoaRow) => a.type === "liability" || a.type === "contra_liability").map(section);
    const equityRows = accounts.filter((a: CoaRow) => a.type === "equity" || a.type === "contra_equity").map(section);

    // Asset total nets contra-assets (their balance is stored negative).
    const totalAssets = assetRows.reduce((s, a) => s + a.balance, 0);
    // Liabilities/equity are credit-normal → stored negative; present as positive.
    const totalLiabilities = -liabilityRows.reduce((s, a) => s + a.balance, 0);
    const equityBase = -equityRows.reduce((s, a) => s + a.balance, 0);

    // Net income to date = income − expense (both from snapshot, sign-normalised).
    const totalIncome = accounts
      .filter((a: CoaRow) => a.type === "income" || a.type === "contra_income")
      .reduce((s: number, a: CoaRow) => s - Number(a.currentBalance), 0);
    const totalExpenses = accounts
      .filter((a: CoaRow) => a.type === "expense" || a.type === "contra_expense")
      .reduce((s: number, a: CoaRow) => s + Number(a.currentBalance), 0);
    const currentPeriodEarnings = totalIncome - totalExpenses;

    const totalEquity = equityBase + currentPeriodEarnings;
    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

    return {
      assets: { rows: assetRows, total: totalAssets },
      liabilities: { rows: liabilityRows, total: totalLiabilities },
      equity: {
        rows: equityRows,
        currentPeriodEarnings,
        total: totalEquity,
      },
      totalAssets,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced,
    };
  }),

  // ── GSTIN Registry ───────────────────────────────────────────────────────

  gstin: router({
    list: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      const { org, db } = ctx;
      const { gstinRegistry, eq: dbEq } = await import("@coheronconnect/db");
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
      const { gstinRegistry, eq: dbEq } = await import("@coheronconnect/db");
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
      const { gstinRegistry, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
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
      const { invoices, invoiceLineItems, gstinRegistry, eq: dbEq, and: dbAnd, gte, lte, inArray } = await import("@coheronconnect/db");
      const [gstin] = await db.select().from(gstinRegistry)
        .where(dbAnd(dbEq(gstinRegistry.id, input.gstinId), dbEq(gstinRegistry.orgId, org!.id))).limit(1);
      if (!gstin) throw new TRPCError({ code: "NOT_FOUND" });

      const start = new Date(input.year, input.month - 1, 1);
      const end   = new Date(input.year, input.month, 0, 23, 59, 59);

      const invs = await db.select().from(invoices)
        .where(dbAnd(dbEq(invoices.orgId, org!.id), gte(invoices.invoiceDate, start), lte(invoices.invoiceDate, end)));

      // Fetch line items for all invoices in the period so GSTR-1 `itms` can be
      // grouped by actual GST rate (not a hardcoded 18%). Invoices with no line
      // items fall back to a single rate derived from header tax amounts.
      const invIds = invs.map((i) => i.id);
      const allLines = invIds.length
        ? await db.select().from(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invIds))
        : [];
      const linesByInvoice = new Map<string, typeof allLines>();
      for (const ln of allLines) {
        const bucket = linesByInvoice.get(ln.invoiceId) ?? [];
        bucket.push(ln);
        linesByInvoice.set(ln.invoiceId, bucket);
      }

      /**
       * Build one GSTR-1 `itm_det` per distinct GST rate for an invoice.
       * Prefers real per-line data; falls back to a single header-derived rate.
       */
      function buildItms(inv: typeof invs[number]): GstrItem[] {
        const lines = linesByInvoice.get(inv.id) ?? [];
        if (lines.length > 0) {
          const byRate = new Map<number, { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
          for (const ln of lines) {
            const rt = Number(ln.gstRate ?? 0);
            const agg = byRate.get(rt) ?? { rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
            agg.txval += Number(ln.taxableValue ?? 0);
            agg.iamt  += Number(ln.igstAmount ?? 0);
            agg.camt  += Number(ln.cgstAmount ?? 0);
            agg.samt  += Number(ln.sgstAmount ?? 0);
            byRate.set(rt, agg);
          }
          const round2 = (n: number) => Math.round(n * 100) / 100;
          return Array.from(byRate.values())
            .sort((a, b) => a.rt - b.rt)
            .map((v, idx) => ({
              num: idx + 1,
              itm_det: {
                rt: v.rt,
                txval: round2(v.txval),
                iamt: round2(v.iamt),
                camt: round2(v.camt),
                samt: round2(v.samt),
                csamt: 0,
              },
            }));
        }
        // Fallback: derive the effective rate from header tax amounts.
        const txval = Number(inv.taxableValue ?? 0);
        const iamt = Number(inv.igstAmount ?? 0);
        const camt = Number(inv.cgstAmount ?? 0);
        const samt = Number(inv.sgstAmount ?? 0);
        const totalTax = iamt + camt + samt;
        const rt = txval > 0 ? Math.round((totalTax / txval) * 100) : 0;
        return [{ num: 1, itm_det: { rt, txval, iamt, camt, samt, csamt: 0 } }];
      }

      type GstrItem = {
        num: number;
        itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };
      };
      type GstrEntry = {
        inum: string;
        idt: string;
        val: number;
        pos: string;
        rchrg: string;
        itms: GstrItem[];
      };
      const b2b: Array<{ ctin: string; inv: GstrEntry[] }> = [];
      const b2c: Array<GstrEntry & { ty: string }> = [];

      for (const inv of invs) {
        const entry: GstrEntry = {
          inum: inv.invoiceNumber,
          idt: new Date(inv.invoiceDate!).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
          val: Number(inv.amount ?? 0),
          pos: inv.placeOfSupply ?? gstin.stateCode,
          rchrg: (inv.isReverseCharge ?? false) ? "Y" : "N",
          itms: buildItms(inv),
        };

        if (inv.buyerGstin) {
          const existing = b2b.find((g) => g.ctin === inv.buyerGstin);
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
      const { invoices, gstinRegistry, eq: dbEq, and: dbAnd, gte, lte, sum } = await import("@coheronconnect/db");
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

  // ── Bank Reconciliation ────────────────────────────────────────────────
  bankRec: router({

    /** List reconciliation statements (sessions), newest first. */
    listStatements: permissionProcedure("financial", "read").input(z.object({
      accountId: z.string().uuid().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankStatements, eq: dbEq, and: dbAnd, desc: dbDesc } = await import("@coheronconnect/db");
      const conds: SQL[] = [dbEq(bankStatements.orgId, org!.id)];
      if (input?.accountId) conds.push(dbEq(bankStatements.accountId, input.accountId));
      return db.select().from(bankStatements).where(dbAnd(...conds)).orderBy(dbDesc(bankStatements.createdAt));
    }),

    /** Create a new statement (reconciliation session) for a bank/cash account. */
    createStatement: permissionProcedure("financial", "write").input(z.object({
      accountId: z.string().uuid(),
      name: z.string().min(1).max(200),
      periodStart: z.coerce.date().optional(),
      periodEnd: z.coerce.date().optional(),
      statementBalance: z.number().default(0),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { chartOfAccounts, bankStatements, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const [acct] = await db.select().from(chartOfAccounts)
        .where(dbAnd(dbEq(chartOfAccounts.id, input.accountId), dbEq(chartOfAccounts.orgId, org!.id))).limit(1);
      if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      if (acct.subType !== "bank" && acct.subType !== "cash") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reconciliation requires a bank or cash account" });
      }
      const [stmt] = await db.insert(bankStatements).values({
        orgId: org!.id,
        accountId: input.accountId,
        name: input.name,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        statementBalance: String(input.statementBalance),
        status: "in_progress",
        createdById: user?.id ?? null,
      }).returning();
      return stmt;
    }),

    /** Get one statement with its transactions. */
    getStatement: permissionProcedure("financial", "read").input(z.object({
      statementId: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankStatements, bankTransactions, eq: dbEq, and: dbAnd, asc: dbAsc } = await import("@coheronconnect/db");
      const [stmt] = await db.select().from(bankStatements)
        .where(dbAnd(dbEq(bankStatements.id, input.statementId), dbEq(bankStatements.orgId, org!.id))).limit(1);
      if (!stmt) throw new TRPCError({ code: "NOT_FOUND" });
      const txns = await db.select().from(bankTransactions)
        .where(dbAnd(dbEq(bankTransactions.statementId, input.statementId), dbEq(bankTransactions.orgId, org!.id)))
        .orderBy(dbAsc(bankTransactions.txnDate));
      return { statement: stmt, transactions: txns };
    }),

    /** Bulk import bank statement lines (from CSV). Positive amount = money in. */
    importTransactions: permissionProcedure("financial", "write").input(z.object({
      statementId: z.string().uuid(),
      rows: z.array(z.object({
        txnDate: z.coerce.date(),
        description: z.string().min(1),
        reference: z.string().optional(),
        amount: z.number(),
      })).min(1).max(5000),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankStatements, bankTransactions, eq: dbEq, and: dbAnd, sql: dbSql } = await import("@coheronconnect/db");
      const [stmt] = await db.select().from(bankStatements)
        .where(dbAnd(dbEq(bankStatements.id, input.statementId), dbEq(bankStatements.orgId, org!.id))).limit(1);
      if (!stmt) throw new TRPCError({ code: "NOT_FOUND" });
      if (stmt.status === "reconciled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Statement is already reconciled" });
      }
      await db.insert(bankTransactions).values(input.rows.map((r) => ({
        orgId: org!.id,
        statementId: input.statementId,
        txnDate: r.txnDate,
        description: r.description,
        reference: r.reference ?? null,
        amount: String(r.amount),
        status: "unmatched" as const,
      })));
      await db.update(bankStatements)
        .set({ txnCount: dbSql`${bankStatements.txnCount} + ${input.rows.length}`, updatedAt: new Date() })
        .where(dbEq(bankStatements.id, input.statementId));
      return { imported: input.rows.length };
    }),

    /**
     * Suggest journal-entry matches for the unmatched transactions of a statement.
     * Scoring: exact amount (50) + date proximity (≤30) + description token overlap (≤20).
     */
    suggestMatches: permissionProcedure("financial", "read").input(z.object({
      statementId: z.string().uuid(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const {
        bankStatements, bankTransactions, journalEntries, journalEntryLines,
        eq: dbEq, and: dbAnd,
      } = await import("@coheronconnect/db");

      const [stmt] = await db.select().from(bankStatements)
        .where(dbAnd(dbEq(bankStatements.id, input.statementId), dbEq(bankStatements.orgId, org!.id))).limit(1);
      if (!stmt) throw new TRPCError({ code: "NOT_FOUND" });

      const txns = await db.select().from(bankTransactions)
        .where(dbAnd(
          dbEq(bankTransactions.statementId, input.statementId),
          dbEq(bankTransactions.orgId, org!.id),
          dbEq(bankTransactions.status, "unmatched"),
        ));
      if (txns.length === 0) return { suggestions: [] as Array<{ transactionId: string; journalEntryId: string; score: number; jeNumber: string; jeDescription: string | null; jeDate: Date; jeAmount: number }> };

      // Candidate journal entries that touch this bank account, posted, not already matched.
      const candidateRows: Array<{ je: JeRow; lineDebit: string; lineCredit: string }> = await db
        .select({ je: journalEntries, lineDebit: journalEntryLines.debitAmount, lineCredit: journalEntryLines.creditAmount })
        .from(journalEntryLines)
        .innerJoin(journalEntries, dbAnd(
          dbEq(journalEntryLines.journalEntryId, journalEntries.id),
          dbEq(journalEntries.status, "posted"),
        ))
        .where(dbAnd(
          dbEq(journalEntryLines.orgId, org!.id),
          dbEq(journalEntryLines.accountId, stmt.accountId),
        ));

      // Net effect on the bank account per JE (debit increases bank, credit decreases).
      const jeAmountById = new Map<string, { je: JeRow; amount: number }>();
      for (const row of candidateRows) {
        const net = Number(row.lineDebit) - Number(row.lineCredit);
        const existing = jeAmountById.get(row.je.id);
        if (existing) existing.amount += net;
        else jeAmountById.set(row.je.id, { je: row.je, amount: net });
      }
      const candidates = [...jeAmountById.values()];

      const tokenize = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
      const DAY = 24 * 60 * 60 * 1000;

      const suggestions: Array<{ transactionId: string; journalEntryId: string; score: number; jeNumber: string; jeDescription: string | null; jeDate: Date; jeAmount: number }> = [];
      for (const txn of txns) {
        const txnAmt = Number(txn.amount);
        const txnTokens = tokenize(`${txn.description} ${txn.reference ?? ""}`);
        let best: { je: JeRow; amount: number; score: number } | null = null;
        for (const cand of candidates) {
          // Amount sign + magnitude must align (money-in matches positive JE bank impact).
          const amountDiff = Math.abs(cand.amount - txnAmt);
          let score = 0;
          if (amountDiff < 0.01) score += 50;
          else if (amountDiff <= Math.max(1, Math.abs(txnAmt) * 0.02)) score += 30; // within 2%/₹1
          else continue; // amount too far off — skip

          const daysApart = Math.abs(cand.je.date.getTime() - txn.txnDate.getTime()) / DAY;
          if (daysApart <= 1) score += 30;
          else if (daysApart <= 3) score += 20;
          else if (daysApart <= 7) score += 10;

          const jeTokens = tokenize(`${cand.je.description ?? ""} ${cand.je.reference ?? ""} ${cand.je.number}`);
          let overlap = 0;
          for (const t of txnTokens) if (jeTokens.has(t)) overlap++;
          if (overlap > 0) score += Math.min(20, overlap * 7);

          if (!best || score > best.score) best = { je: cand.je, amount: cand.amount, score };
        }
        if (best && best.score >= 50) {
          suggestions.push({
            transactionId: txn.id,
            journalEntryId: best.je.id,
            score: Math.min(100, best.score),
            jeNumber: best.je.number,
            jeDescription: best.je.description,
            jeDate: best.je.date,
            jeAmount: best.amount,
          });
        }
      }
      return { suggestions };
    }),

    /** Confirm a match between a bank transaction and a journal entry. */
    match: permissionProcedure("financial", "write").input(z.object({
      transactionId: z.string().uuid(),
      journalEntryId: z.string().uuid(),
      score: z.number().int().min(0).max(100).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { bankTransactions, bankStatements, journalEntries, eq: dbEq, and: dbAnd, sql: dbSql } = await import("@coheronconnect/db");
      const [txn] = await db.select().from(bankTransactions)
        .where(dbAnd(dbEq(bankTransactions.id, input.transactionId), dbEq(bankTransactions.orgId, org!.id))).limit(1);
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      const [je] = await db.select().from(journalEntries)
        .where(dbAnd(dbEq(journalEntries.id, input.journalEntryId), dbEq(journalEntries.orgId, org!.id))).limit(1);
      if (!je) throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found" });

      await db.update(bankTransactions).set({
        status: "matched",
        matchedJournalEntryId: input.journalEntryId,
        matchScore: input.score ?? null,
        matchedAt: new Date(),
        matchedById: user?.id ?? null,
      }).where(dbEq(bankTransactions.id, input.transactionId));

      if (txn.status !== "matched") {
        await db.update(bankStatements)
          .set({ matchedCount: dbSql`${bankStatements.matchedCount} + 1`, updatedAt: new Date() })
          .where(dbEq(bankStatements.id, txn.statementId));
      }
      return { ok: true };
    }),

    /** Clear a match or un-ignore — return a transaction to unmatched. */
    unmatch: permissionProcedure("financial", "write").input(z.object({
      transactionId: z.string().uuid(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankTransactions, bankStatements, eq: dbEq, and: dbAnd, sql: dbSql } = await import("@coheronconnect/db");
      const [txn] = await db.select().from(bankTransactions)
        .where(dbAnd(dbEq(bankTransactions.id, input.transactionId), dbEq(bankTransactions.orgId, org!.id))).limit(1);
      if (!txn) throw new TRPCError({ code: "NOT_FOUND" });
      const wasMatched = txn.status === "matched";
      await db.update(bankTransactions).set({
        status: "unmatched",
        matchedJournalEntryId: null,
        matchScore: null,
        matchedAt: null,
        matchedById: null,
      }).where(dbEq(bankTransactions.id, input.transactionId));
      if (wasMatched) {
        await db.update(bankStatements)
          .set({ matchedCount: dbSql`GREATEST(${bankStatements.matchedCount} - 1, 0)`, updatedAt: new Date() })
          .where(dbEq(bankStatements.id, txn.statementId));
      }
      return { ok: true };
    }),

    /** Mark a transaction as ignored (e.g. bank fee already booked elsewhere). */
    ignore: permissionProcedure("financial", "write").input(z.object({
      transactionId: z.string().uuid(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankTransactions, bankStatements, eq: dbEq, and: dbAnd, sql: dbSql } = await import("@coheronconnect/db");
      const [txn] = await db.select().from(bankTransactions)
        .where(dbAnd(dbEq(bankTransactions.id, input.transactionId), dbEq(bankTransactions.orgId, org!.id))).limit(1);
      if (!txn) throw new TRPCError({ code: "NOT_FOUND" });
      const wasMatched = txn.status === "matched";
      await db.update(bankTransactions).set({
        status: "ignored",
        matchedJournalEntryId: null,
        matchScore: null,
        matchedAt: null,
        matchedById: null,
      }).where(dbEq(bankTransactions.id, input.transactionId));
      if (wasMatched) {
        await db.update(bankStatements)
          .set({ matchedCount: dbSql`GREATEST(${bankStatements.matchedCount} - 1, 0)`, updatedAt: new Date() })
          .where(dbEq(bankStatements.id, txn.statementId));
      }
      return { ok: true };
    }),

    /** Finalize: requires every transaction to be matched or ignored. */
    reconcile: permissionProcedure("financial", "write").input(z.object({
      statementId: z.string().uuid(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { bankStatements, bankTransactions, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
      const [stmt] = await db.select().from(bankStatements)
        .where(dbAnd(dbEq(bankStatements.id, input.statementId), dbEq(bankStatements.orgId, org!.id))).limit(1);
      if (!stmt) throw new TRPCError({ code: "NOT_FOUND" });
      const txns = await db.select().from(bankTransactions)
        .where(dbAnd(dbEq(bankTransactions.statementId, input.statementId), dbEq(bankTransactions.orgId, org!.id)));
      const outstanding = txns.filter((t: { status: string }) => t.status === "unmatched");
      if (outstanding.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${outstanding.length} transaction(s) still unmatched` });
      }
      const [updated] = await db.update(bankStatements)
        .set({ status: "reconciled", updatedAt: new Date() })
        .where(dbEq(bankStatements.id, input.statementId)).returning();
      return updated;
    }),
  }),
});
