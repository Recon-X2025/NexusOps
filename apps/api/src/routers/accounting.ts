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
import type { SQL, DbOrTx } from "@coheronconnect/db";
import {
  chartOfAccounts as chartOfAccountsTbl,
  journalEntries as journalEntriesTbl,
  journalEntryLines as journalEntryLinesTbl,
  accountTypeEnum,
  accountSubTypeEnum,
  journalEntryStatusEnum,
} from "@coheronconnect/db";

import { computeRetainUntil } from "../lib/retention";
import { getNextYearScopedSeq } from "../lib/auto-number";
import {
  buildHsnSummary,
  hsnMinDigits,
  findHsnDigitViolations,
  normaliseStateToCode,
  type HsnSummaryLine,
} from "../lib/india/gst-engine";
// The GSTIN is the authority on its own state — see `gstin.create` below.
import { validateGSTIN } from "@coheronconnect/payroll-math";

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
export const INDIA_COA_SEED = [
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
  { code: "1170", name: "Inventory",                   type: "asset",     subType: "other_current_asset", isSystem: false, parentCode: "1100" },
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
  // Contra-revenue: credit notes debit this, NOT gross sales (4110/4120), so
  // gross-to-net revenue stays auditable. Net revenue = 4100 children − 4130.
  { code: "4130", name: "Sales Returns & Allowances",  type: "income",    subType: "income",              isSystem: true, parentCode: "4100" },
  // Debit notes CREDIT this (the mirror of 4130), NOT gross sales — same audit-trail
  // reason: upward revisions (escalation, under-billing) stay separable from gross sales.
  { code: "4140", name: "Supplementary Sales & Revenue Adjustments", type: "income", subType: "income", isSystem: true, parentCode: "4100" },
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

/**
 * Idempotently seed the default India chart of accounts for an org. Safe to
 * call repeatedly — accounts already present (by code) are skipped. Used both
 * by the `coa.seed` mutation and at self-serve signup so a brand-new org can
 * post journal entries (depreciation, COGS, invoice GST) from day one.
 * Returns the CODES inserted (empty when the org is already aligned) so callers —
 * notably the startup seed reconciler — can log exactly what they added.
 */
export async function seedChartOfAccountsForOrg(
  db: DbOrTx,
  orgId: string,
): Promise<string[]> {
  const { chartOfAccounts, eq: dbEq } = await import("@coheronconnect/db");
  const existing = await db
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(dbEq(chartOfAccounts.orgId, orgId));
  const codeToId = new Map<string, string>(existing.map((r) => [r.code, r.id]));

  const insertedCodes: string[] = [];
  for (const acct of INDIA_COA_SEED) {
    if (codeToId.has(acct.code)) continue;
    const parentId = acct.parentCode ? (codeToId.get(acct.parentCode) ?? undefined) : undefined;
    const [inserted] = await db
      .insert(chartOfAccounts)
      .values({
        orgId,
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
    insertedCodes.push(acct.code);
  }
  return insertedCodes;
}

// ── Router ─────────────────────────────────────────────────────────────────

export const accountingRouter = router({

  // ── Chart of Accounts ──────────────────────────────────────────────────

  coa: router({
    list: permissionProcedure("financial", "read").input(z.object({
      type: z.enum(accountTypeEnum.enumValues).optional(),
      activeOnly: z.boolean().default(true),
      limit: z.coerce.number().int().min(1).max(1000).default(50),
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
      const { chartOfAccounts, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");

      // `coa_org_code_idx` is UNIQUE per org. Re-using a code is an everyday
      // mistake, and without this the raw Postgres violation escaped as a 500
      // with the constraint name as the user-facing message. Report the clash
      // naming the field to fix.
      const [clash] = await db
        .select({ id: chartOfAccounts.id, name: chartOfAccounts.name })
        .from(chartOfAccounts)
        .where(dbAnd(dbEq(chartOfAccounts.orgId, org!.id), dbEq(chartOfAccounts.code, input.code)))
        .limit(1);
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Account code ${input.code} is already used by "${clash.name}". Choose a different code.`,
        });
      }

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
      // F15/COA: SYSTEM accounts (CGST/SGST/IGST ITC, TDS Receivable, the roll-up parents…) are
      // resolved by CODE for GST/TDS/invoice postings. code/type/subType are already immutable here
      // (not in the input), but a rename or deactivate of a system account is still wrong — it makes
      // a posting account vanish from the UI and rewrites what past journal lines appear to mean.
      // Refuse any edit to a system account. (Balance is never editable — it is derived from journal
      // entries and is not a column on this update.)
      // Guard ONLY the system-account case — leave the not-found / cross-tenant path as the
      // existing silent no-op (the orgId in the update's where-clause already gives tenant
      // isolation; tenant-isolation.test relies on that no-op, so do not turn it into a throw).
      const [target] = await db
        .select({ isSystem: chartOfAccounts.isSystem })
        .from(chartOfAccounts)
        .where(dbAnd(dbEq(chartOfAccounts.id, id), dbEq(chartOfAccounts.orgId, org!.id)))
        .limit(1);
      if (target?.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This is a system account (used by automated GST/TDS/invoice postings) and cannot be " +
            "renamed or deactivated. Create a separate account if you need a custom one.",
        });
      }
      const [acct] = await db.update(chartOfAccounts).set({ ...updates, updatedAt: new Date() })
        .where(dbAnd(dbEq(chartOfAccounts.id, id), dbEq(chartOfAccounts.orgId, org!.id))).returning();
      return acct!;
    }),

    /** Seed standard India COA (idempotent). */
    seed: permissionProcedure("financial", "write").input(z.object({}).optional()).mutation(async ({ ctx }) => {
      const { org, db } = ctx;
      try {
        const insertedCodes = await seedChartOfAccountsForOrg(db, org!.id);
        return { seeded: insertedCodes.length, total: INDIA_COA_SEED.length };
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
      const { journalEntries, journalEntryLines } = await import("@coheronconnect/db");

      // Validate balanced entry
      const totalDebit  = input.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit}` });
      }

      const fy = input.financialYear ?? currentFY(input.date);

      // Header + lines are one entry; do them in a transaction so a line-insert
      // failure can't leave a header with no (or partial) line items.
      return await db.transaction(async (tx) => {
        // The JE number is minted by the atomic per-(org, "JE-<year>") counter, not
        // count()+1: two concurrent creates therefore receive distinct consecutive
        // numbers with no unique-violation/retry. Format is unchanged — JE-YYYY-00001
        // (5-pad, year-scoped, restarts each year). Reversals share this same counter.
        const jeYear = input.date.getFullYear();
        const seq = await getNextYearScopedSeq(tx, org!.id, "JE", jeYear, "journal_entries", "number");
        const number = `JE-${jeYear}-${String(seq).padStart(5, "0")}`;

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
          retainUntilDate: computeRetainUntil(input.date),
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

      // Lock, draft-check, balance updates and the status flip are one atomic unit.
      // The entry row is taken FOR UPDATE *before* the "still draft?" check so two
      // concurrent posts of the same draft cannot both pass the check and apply the
      // balances twice: the second caller blocks on the lock until the first commits
      // "posted", then re-reads that status and stops. (The lock is held until the
      // outer request transaction commits — releasing this nested savepoint does not
      // release the row lock — so it spans the balance writes below.)
      return await db.transaction(async (tx) => {
        const [je] = await tx.select().from(journalEntries)
          .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id)))
          .limit(1)
          .for("update");
        if (!je) throw new TRPCError({ code: "NOT_FOUND" });
        if (je.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft entries can be posted" });

        const lines = await tx.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));

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
      const { journalEntries, journalEntryLines, chartOfAccounts, eq: dbEq, and: dbAnd, sql } = await import("@coheronconnect/db");

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
        // Reversals draw from the SAME atomic "JE-<year>" counter as journal.create
        // (both emit JE-YYYY-NNNNN; a reversal just suffixes "-REV"), so the visible
        // JE sequence stays a single monotonic run per year and two concurrent number
        // reads can't collide. Format unchanged: JE-YYYY-00001-REV (5-pad).
        const revYear = revDate.getFullYear();
        const seq = await getNextYearScopedSeq(tx, org!.id, "JE", revYear, "journal_entries", "number");
        const revNumber = `JE-${revYear}-${String(seq).padStart(5, "0")}-REV`;

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
          retainUntilDate: computeRetainUntil(revDate),
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
  /**
   * Trial balance, optionally as at a date.
   *
   * `asOfDate` used to be DECLARED and silently ignored — every line came from the
   * `currentBalance` snapshot, so a caller asking for a past date got today's
   * numbers with no error. It is now honoured on the same basis as `balanceSheet`:
   * opening balance plus the net movement on POSTED journal-entry lines dated on or
   * before the date. Without it the snapshot is used, which is inception-to-date.
   *
   * `financialYear` was removed rather than implemented. It had never done anything,
   * and an input that advertises a filter it does not apply is worse than no input —
   * it returns a confidently wrong answer. Both callers passed `{}`.
   */
  trialBalance: permissionProcedure("financial", "read").input(z.object({
    asOfDate: z.coerce.date().optional(),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const {
      chartOfAccounts, journalEntries, journalEntryLines,
      eq: dbEq, and: dbAnd, lte, sql: dbSql,
    } = await import("@coheronconnect/db");

    const accounts = await db.select().from(chartOfAccounts)
      .where(dbEq(chartOfAccounts.orgId, org!.id));

    const asOf = input?.asOfDate;

    // Same derivation as `balanceSheet` — keep the two in step, or a trial balance
    // and a balance sheet pulled for the same date will disagree.
    let balanceOf = (a: CoaRow) => Number(a.currentBalance);
    if (asOf) {
      const movements = await db
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
            lte(journalEntries.date, asOf),
          ),
        )
        .where(dbEq(journalEntryLines.orgId, org!.id))
        .groupBy(journalEntryLines.accountId);

      const netByAccount = new Map<string, number>();
      for (const m of movements) netByAccount.set(m.accountId, Number(m.net));
      balanceOf = (a: CoaRow) => Number(a.openingBalance) + (netByAccount.get(a.id) ?? 0);
    }

    const isDebitNormal = (type: string) => ["asset", "expense", "contra_liability", "contra_equity", "contra_income"].includes(type);

    const lines = accounts.map((a: CoaRow) => {
      const bal = balanceOf(a);
      const isDrNormal = isDebitNormal(a.type);
      
      let debit = 0;
      let credit = 0;

      if (isDrNormal) {
        if (bal >= 0) {
          debit = bal;
        } else {
          credit = Math.abs(bal);
        }
      } else {
        if (bal <= 0) {
          credit = Math.abs(bal);
        } else {
          debit = bal;
        }
      }

      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit,
        credit,
      };
    });

    const totalDebit  = lines.reduce((s: number, a) => s + a.debit, 0);
    const totalCredit = lines.reduce((s: number, a) => s + a.credit, 0);
    const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      lines,
      totalDebit,
      totalCredit,
      isBalanced,
    };
  }),

  // `incomeStatement` was REMOVED on 2026-08-17. Use `profitAndLoss` below.
  //
  // It read the `currentBalance` snapshot, so it always reported inception-to-date
  // while advertising `financialYear`/`startDate`/`endDate` on its input schema and
  // silently ignoring all three. It also summed every account with `Math.abs()`,
  // which ADDED contra-revenue instead of subtracting it — COA 4130 (Sales Returns
  // & Allowances) is deliberately typed `income` and debited by credit notes, so
  // any refund inflated both income and net profit.
  //
  // Its only caller in the whole web app was the P&L tab of the orphaned
  // `/app/accounting` console, which rendered the figure as "Net Profit" with no
  // period selector. Both were retired together. `profitAndLoss` sums posted
  // journal-entry movements inside a real date window and signs contra accounts
  // correctly.

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
   * Two bases, chosen by whether `asOfDate` is supplied:
   *
   *  - **`as_at` (asOfDate given)** — each account's balance is DERIVED:
   *    `openingBalance + Σ(debit − credit)` over posted journal lines whose
   *    entry date is ≤ asOfDate. This is the same arithmetic `ledger` uses, so
   *    a figure on this statement and the running balance on the General Ledger
   *    for that account are the same number by construction. It is also the only
   *    basis that can answer "what did this look like at the end of July".
   *  - **`current_balance_snapshot` (no asOfDate)** — the denormalised
   *    `chart_of_accounts.currentBalance`, which only `journal.post`/`reverse`
   *    move. Retained as the default so existing callers are unchanged.
   *
   * The two agree on any org whose rows were all written through the product
   * path; they diverge where something wrote a posted entry directly without
   * moving the snapshot (`seed-modules.ts` does exactly that), and the derived
   * basis is the trustworthy one there because the ledger is the record.
   *
   * Because the accounting identity only closes once P&L is swept to retained
   * earnings, the *net income to date* (income − expense) is folded into equity
   * as a synthetic "Current Period Earnings" line so the sheet balances without
   * requiring a period-close entry. Contra-asset balances (e.g. accumulated
   * depreciation) net down assets.
   */
  balanceSheet: permissionProcedure("financial", "read").input(z.object({
    asOfDate: z.coerce.date().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { chartOfAccounts, journalEntries, journalEntryLines, eq: dbEq, and: dbAnd, lte, sql: dbSql } = await import("@coheronconnect/db");

    const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));

    const asOf = input?.asOfDate;

    // Derived basis: sum posted movements up to and including asOfDate.
    let balanceOf = (a: CoaRow) => Number(a.currentBalance);
    if (asOf) {
      const movements = await db
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
            lte(journalEntries.date, asOf),
          ),
        )
        .where(dbEq(journalEntryLines.orgId, org!.id))
        .groupBy(journalEntryLines.accountId);

      const netByAccount = new Map<string, number>();
      for (const m of movements) netByAccount.set(m.accountId, Number(m.net));
      balanceOf = (a: CoaRow) => Number(a.openingBalance) + (netByAccount.get(a.id) ?? 0);
    }

    const section = (a: CoaRow) => ({
      id: a.id, code: a.code, name: a.name, type: a.type, subType: a.subType,
      balance: balanceOf(a),
    });

    // Assets are debit-normal (balance ≥ 0 typical); contra-assets are credit-
    // normal and reduce the asset total. Present both, net at the total.
    const assetRows = accounts.filter((a: CoaRow) => a.type === "asset" || a.type === "contra_asset").map(section);
    const liabilityRows = accounts.filter((a: CoaRow) => a.type === "liability" || a.type === "contra_liability").map(section);
    const equityRows = accounts.filter((a: CoaRow) => a.type === "equity" || a.type === "contra_equity").map(section);

    // Sign-flipping a zero yields -0, which Intl renders as "-₹0.00" on a
    // statement line. Normalise it away at the source rather than in each
    // consumer.
    const noNegZero = (n: number) => (n === 0 ? 0 : n);

    // Asset total nets contra-assets (their balance is stored negative).
    const totalAssets = noNegZero(assetRows.reduce((s, a) => s + a.balance, 0));
    // Liabilities/equity are credit-normal → stored negative; present as positive.
    const totalLiabilities = noNegZero(-liabilityRows.reduce((s, a) => s + a.balance, 0));
    const equityBase = noNegZero(-equityRows.reduce((s, a) => s + a.balance, 0));

    // Net income to date = income − expense (same basis, sign-normalised).
    const totalIncome = noNegZero(accounts
      .filter((a: CoaRow) => a.type === "income" || a.type === "contra_income")
      .reduce((s: number, a: CoaRow) => s - balanceOf(a), 0));
    const totalExpenses = noNegZero(accounts
      .filter((a: CoaRow) => a.type === "expense" || a.type === "contra_expense")
      .reduce((s: number, a: CoaRow) => s + balanceOf(a), 0));
    const currentPeriodEarnings = noNegZero(totalIncome - totalExpenses);

    const totalEquity = noNegZero(equityBase + currentPeriodEarnings);
    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

    return {
      // Echoed so a screen states the date it actually computed for rather than
      // the date the user believes they picked.
      asOfDate: asOf ?? null,
      basis: (asOf ? "as_at" : "current_balance_snapshot") as "as_at" | "current_balance_snapshot",
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
      /**
       * OPTIONAL, and derived when omitted — the first two characters of a GSTIN
       * ARE its state code, so asking for it separately only creates a chance to
       * disagree. Supplying one that contradicts the GSTIN is rejected below.
       */
      stateCode: z.string().length(2).optional(),
      stateName: z.string().optional(),
      address: z.string().optional(),
      registrationDate: z.coerce.date().optional(),
      isPrimary: z.boolean().default(false),
      invoiceSeriesPrefix: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstinRegistry, eq: dbEq } = await import("@coheronconnect/db");

      /*
       * The state code is DERIVED from the GSTIN, never taken on trust.
       *
       * `gstin_registry.stateCode` is the supplier side of every GST split:
       * `resolveOrgState` reads it, and `computeGST` decides intra- vs
       * inter-state from it. It must therefore be a 2-DIGIT GST code ("29"), and
       * `normaliseStateToCode` returns null for anything else.
       *
       * The Setup Wizard asked for a "2-letter ISO 3166-2:IN code" (placeholder
       * "MH", default "KA") and wrote THAT here. Both normalise to null, so the
       * supplier had no state, `computeGST` compared "" against the buyer's
       * "29", and every sale was billed INTER-state IGST — the right total, the
       * wrong split, on documents customers claim input credit against.
       *
       * `validateGSTIN` covers all 39 GST jurisdictions (01–24, 26–38, plus 97
       * Other Territory and 99 Centre Jurisdiction), so deriving is complete for
       * every state and union territory rather than a list someone maintains.
       */
      const parsed = validateGSTIN(input.gstin);
      if (!parsed.valid || !parsed.stateCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error ?? "Invalid GSTIN" });
      }
      if (input.stateCode && input.stateCode !== parsed.stateCode) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `State code ${input.stateCode} contradicts GSTIN ${input.gstin}, which is registered in ${parsed.stateName} (${parsed.stateCode}). The GSTIN decides the state.`,
        });
      }

      if (input.isPrimary) {
        // Demote all others
        await db.update(gstinRegistry).set({ isPrimary: false }).where(dbEq(gstinRegistry.orgId, org!.id));
      }
      const [gstin] = await db
        .insert(gstinRegistry)
        .values({
          ...input,
          stateCode: parsed.stateCode,
          stateName: input.stateName ?? parsed.stateName,
          orgId: org!.id,
        })
        .returning();
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
      const { invoices, invoiceLineItems, gstinRegistry, organizations, eq: dbEq, and: dbAnd, gte, lte, inArray } = await import("@coheronconnect/db");
      const [gstin] = await db.select().from(gstinRegistry)
        .where(dbAnd(dbEq(gstinRegistry.id, input.gstinId), dbEq(gstinRegistry.orgId, org!.id))).limit(1);
      if (!gstin) throw new TRPCError({ code: "NOT_FOUND" });

      // Annual Aggregate Turnover drives the Table 12 HSN digit minimum; the
      // B2CL threshold drives the Table 5 vs Table 7 split (per-tenant, default ₹1L).
      const [orgRow] = await db
        .select({
          aato: organizations.annualAggregateTurnover,
          b2clThreshold: organizations.b2clThreshold,
        })
        .from(organizations)
        .where(dbEq(organizations.id, org!.id))
        .limit(1);
      const aato = orgRow?.aato != null ? Number(orgRow.aato) : null;
      const b2clThreshold = orgRow?.b2clThreshold != null ? Number(orgRow.b2clThreshold) : 100000;

      const start = new Date(input.year, input.month - 1, 1);
      const end   = new Date(input.year, input.month, 0, 23, 59, 59);

      // GSTR-1 is the OUTWARD-supplies return: only our own sales belong in it.
      // Without this filter, payable (purchase) invoices were filed as our own
      // outward supplies — over-reporting output tax and inventing self-supplies.
      const invs = await db.select().from(invoices)
        .where(dbAnd(
          dbEq(invoices.orgId, org!.id),
          dbEq(invoices.gstinId, input.gstinId),
          dbEq(invoices.invoiceFlow, "receivable"),
          gte(invoices.invoiceDate, start),
          lte(invoices.invoiceDate, end)
        ));

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
      const b2cl: Array<{ pos: string; inv: GstrEntry[] }> = [];
      const b2c: Array<GstrEntry & { ty: string }> = [];

      // ── Table 9: credit/debit notes (CDNR registered, CDNUR unregistered) ──
      type NoteEntry = {
        ntty: "C" | "D";   // C = credit note, D = debit note
        nt_num: string;    // note number
        nt_dt: string;     // note date
        onum: string;      // original invoice number
        odt: string;       // original invoice date
        val: number;
        pos: string;
        rchrg: string;
        itms: GstrItem[];
      };
      const cdnr: Array<{ ctin: string; nt: NoteEntry[] }> = [];
      const cdnur: Array<NoteEntry & { typ: string }> = [];
      const noteInvoiceIds = new Set<string>();

      const supplierStateCode = gstin.stateCode;
      const fmtDate = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

      for (const inv of invs) {
        const posRaw = inv.placeOfSupply ?? gstin.stateCode;
        const posCode = normaliseStateToCode(posRaw) ?? posRaw;
        const isInterstate = posCode !== supplierStateCode;

        // Credit/debit notes go to Table 9, never the supply tables. Values are
        // positive with a C/D flag (the portal nets them). CDNR when the buyer is
        // registered (grouped by GSTIN), CDNUR when unregistered. Their lines are
        // excluded from Table 12 below to avoid overstating turnover.
        if (inv.invoiceType === "credit_note" || inv.invoiceType === "debit_note") {
          noteInvoiceIds.add(inv.id);
          // A financial credit note (past the s.34 time limit) carries no GST and
          // is excluded from Table 9 entirely — it's a commercial adjustment only.
          if (inv.isFinancialNote) continue;
          const note: NoteEntry = {
            ntty: inv.invoiceType === "credit_note" ? "C" : "D",
            nt_num: inv.invoiceNumber,
            nt_dt: fmtDate(inv.invoiceDate),
            onum: inv.originalInvoiceNumber ?? "",
            odt: fmtDate(inv.originalInvoiceDate),
            val: Number(inv.amount ?? 0),
            pos: posCode,
            rchrg: (inv.isReverseCharge ?? false) ? "Y" : "N",
            itms: buildItms(inv),
          };
          if (inv.buyerGstin) {
            const grp = cdnr.find((g) => g.ctin === inv.buyerGstin);
            if (grp) grp.nt.push(note);
            else cdnr.push({ ctin: inv.buyerGstin, nt: [note] });
          } else {
            cdnur.push({ ...note, typ: isInterstate ? "B2CL" : "B2CS" });
          }
          continue;
        }

        const entry: GstrEntry = {
          inum: inv.invoiceNumber,
          idt: fmtDate(inv.invoiceDate),
          val: Number(inv.amount ?? 0),
          pos: posCode,
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
          // Unregistered buyer → B2C. Split Table 5 (B2CL) vs Table 7 (B2CS):
          // an INTER-STATE supply whose invoice value EXCEEDS the (per-tenant)
          // threshold is reported invoice-wise in B2CL, grouped by place of
          // supply; everything else stays in the B2CS consolidated summary.
          if (isInterstate && Number(inv.amount ?? 0) > b2clThreshold) {
            const grp = b2cl.find((g) => g.pos === posCode);
            if (grp) grp.inv.push(entry);
            else b2cl.push({ pos: posCode, inv: [entry] });
          } else {
            b2c.push({ ...entry, ty: "B2CS" });
          }
        }
      }

      // ── HSN Summary (Table 12, mandatory) ────────────────────────────────
      // Aggregate every line in the period by HSN × rate. The digit minimum
      // (4 up to ₹5cr AATO, 6 above) is enforced against the org's AATO; when
      // AATO is unset we default to the 4-digit baseline and flag it.
      // Exclude credit/debit-note lines: notes are reported in Table 9, and adding
      // their (positive) values to Table 12 would overstate outward turnover. A
      // fully net-of-notes HSN summary is a follow-up tied to the negative-line
      // treatment (deferred with the ledger reversal).
      const hsnLines: HsnSummaryLine[] = allLines
        .filter((ln) => !noteInvoiceIds.has(ln.invoiceId))
        .map((ln) => ({
          hsnSacCode: ln.hsnSacCode,
          description: ln.description,
          unit: ln.unit,
          quantity: ln.quantity != null ? Number(ln.quantity) : 0,
          taxableValue: Number(ln.taxableValue ?? 0),
          gstRate: Number(ln.gstRate ?? 0),
          cgstAmount: Number(ln.cgstAmount ?? 0),
          sgstAmount: Number(ln.sgstAmount ?? 0),
          igstAmount: Number(ln.igstAmount ?? 0),
        }));
      const hsnData = buildHsnSummary(hsnLines);
      const hsnDigitMin = hsnMinDigits(aato ?? 0);
      const hsnDigitViolations = findHsnDigitViolations(hsnData, hsnDigitMin);

      const warnings: string[] = [];
      if (aato == null) {
        warnings.push(
          "Annual Aggregate Turnover is not set for this organisation; the HSN digit minimum " +
          "defaulted to 4. Set AATO to enforce the 6-digit minimum above ₹5 crore.",
        );
      }
      for (const v of hsnDigitViolations) {
        warnings.push(
          v.hsn
            ? `HSN "${v.hsn}" has ${v.digits} digit(s); this filing requires at least ${v.required}.`
            : `An invoice line has no HSN/SAC code; Table 12 requires at least ${v.required} digits.`,
        );
      }
      const invoicesMissingLines = invs.filter(
        (i) => !noteInvoiceIds.has(i.id) && !(linesByInvoice.get(i.id)?.length),
      ).length;
      if (invoicesMissingLines > 0) {
        warnings.push(
          `${invoicesMissingLines} invoice(s) have no line items and are absent from the HSN summary ` +
          "(Table 12); add line items with HSN/SAC codes for a complete return.",
        );
      }

      const gstp_cd = `${input.month.toString().padStart(2, "0")}${input.year}`;
      const payload = {
        gstin: gstin.gstin,
        fp: gstp_cd,
        b2b,
        b2cl,
        b2cs: b2c,
        cdnr,
        cdnur,
        hsn: { data: hsnData },
        nil: { inv: [] },
        exp: { expwp: [], expwop: [] },
        b2ba: [],
      };

      return {
        payload,
        invoiceCount: invs.length,
        gstin: gstin.gstin,
        period: `${input.month}/${input.year}`,
        annualAggregateTurnover: aato,
        hsnDigitMin,
        warnings,
      };
    }),

    /** Generate GSTR-3B summary return for a period */
    generateGSTR3B: permissionProcedure("financial", "read").input(z.object({
      gstinId: z.string().uuid(),
      month: z.number().int().min(1).max(12),
      year: z.number().int(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { invoices, gstinRegistry, gstr2bImports, gstr2bReconLines, eq: dbEq, and: dbAnd, gte, lte, sum } = await import("@coheronconnect/db");
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
      }).from(invoices).where(dbAnd(
        dbEq(invoices.orgId, org!.id),
        dbEq(invoices.gstinId, input.gstinId),
        gte(invoices.invoiceDate, start),
        lte(invoices.invoiceDate, end)
      ));

      // ITC (from GSTR-2B matched lines)
      const [itc] = await db.select({
        igst: sum(gstr2bReconLines.bookIgst),
        cgst: sum(gstr2bReconLines.bookCgst),
        sgst: sum(gstr2bReconLines.bookSgst),
      })
      .from(gstr2bReconLines)
      .innerJoin(gstr2bImports, dbEq(gstr2bReconLines.importId, gstr2bImports.id))
      .where(dbAnd(
        dbEq(gstr2bImports.orgId, org!.id),
        dbEq(gstr2bImports.gstinId, input.gstinId),
        dbEq(gstr2bImports.month, input.month),
        dbEq(gstr2bImports.year, input.year),
        dbEq(gstr2bReconLines.status, "matched")
      ));

      const outputIGST = Number(outward?.igst ?? 0);
      const outputCGST = Number(outward?.cgst ?? 0);
      const outputSGST = Number(outward?.sgst ?? 0);
      const totalOutputTax = outputIGST + outputCGST + outputSGST;
      
      const inputIGST = Number(itc?.igst ?? 0);
      const inputCGST = Number(itc?.cgst ?? 0);
      const inputSGST = Number(itc?.sgst ?? 0);
      const totalInputTax = inputIGST + inputCGST + inputSGST;

      const payload = {
        gstin: gstin.gstin,
        ret_period: `${input.month.toString().padStart(2, "0")}${input.year}`,
        "3_1": {
          desc: "Outward taxable supplies (other than zero rated, nil and exempted)",
          osup_det: { txval: Number(outward?.taxable ?? 0), iamt: outputIGST, camt: outputCGST, samt: outputSGST, csamt: 0 },
        },
        "4": {
          desc: "Eligible ITC",
          itc_avl: { osup_det: { iamt: inputIGST, camt: inputCGST, samt: inputSGST, csamt: 0 } },
        },
        "5_1": {
          desc: "Interest and late fee payable",
          intr_lt_fee: { intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 } },
        },
      };

      return {
        payload,
        summary: { 
          outputIGST, outputCGST, outputSGST, totalOutputTax,
          inputIGST, inputCGST, inputSGST, totalInputTax,
          netPayable: Math.max(0, totalOutputTax - totalInputTax) 
        },
        gstin: gstin.gstin,
        period: `${input.month}/${input.year}`,
      };
    }),

    // ── Filing record ──────────────────────────────────────────────────────
    //
    // The product prepares returns; the customer files them on the GST portal
    // themselves. These three procedures are the evidence trail around that
    // hand-off: what was generated, when, and the ARN the portal gave back.
    // Without them a generated return is ephemeral and nobody can answer
    // "have we filed this month?".

    /** Persist a generated return so the payload filed is the payload on record. */
    recordFiling: permissionProcedure("financial", "write").input(z.object({
      gstinId: z.string().uuid(),
      formType: z.enum(["GSTR-1", "GSTR-3B"]),
      month: z.number().int().min(1).max(12),
      year: z.number().int(),
      jsonPayload: z.string(),
      totalOutputTax: z.number().default(0),
      totalItc: z.number().default(0),
      netPayable: z.number().default(0),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstrFilings, gstinRegistry, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");

      const [gstin] = await db.select().from(gstinRegistry)
        .where(dbAnd(dbEq(gstinRegistry.id, input.gstinId), dbEq(gstinRegistry.orgId, org!.id))).limit(1);
      if (!gstin) throw new TRPCError({ code: "NOT_FOUND", message: "GSTIN not found for this organisation" });

      // Indian financial year runs April→March: Jan–Mar belong to the FY that
      // started the previous calendar year.
      const fyStart = input.month >= 4 ? input.year : input.year - 1;
      const financialYear = `${fyStart}-${fyStart + 1}`;

      // Re-generating a return for the same period replaces the draft rather
      // than accumulating rows — but never once it has been filed, because at
      // that point the stored payload is the evidence of what went to the
      // portal and must not be silently overwritten.
      const [existing] = await db.select().from(gstrFilings)
        .where(dbAnd(
          dbEq(gstrFilings.orgId, org!.id),
          dbEq(gstrFilings.gstinId, input.gstinId),
          dbEq(gstrFilings.formType, input.formType),
          dbEq(gstrFilings.month, input.month),
          dbEq(gstrFilings.year, input.year),
        )).limit(1);

      if (existing && (existing.status === "filed" || existing.status === "accepted")) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            `${input.formType} for ${input.month}/${input.year} is already recorded as ` +
            `${existing.status}${existing.arn ? ` (ARN ${existing.arn})` : ""}. ` +
            "A filed return's payload is the record of what was submitted and cannot be replaced.",
        });
      }

      const values = {
        orgId: org!.id,
        gstinId: input.gstinId,
        formType: input.formType,
        month: input.month,
        year: input.year,
        financialYear,
        status: "ready" as const,
        totalOutputTax: String(input.totalOutputTax),
        totalItc: String(input.totalItc),
        netPayable: String(input.netPayable),
        jsonPayload: input.jsonPayload,
        updatedAt: new Date(),
      };

      if (existing) {
        const [row] = await db.update(gstrFilings).set(values)
          .where(dbEq(gstrFilings.id, existing.id)).returning();
        return row;
      }
      const [row] = await db.insert(gstrFilings).values(values).returning();
      return row;
    }),

    /** Record that the customer filed it on the portal, with the ARN received. */
    markFiled: permissionProcedure("financial", "write").input(z.object({
      filingId: z.string().uuid(),
      arn: z.string().trim().min(1, "Enter the ARN shown on the GST portal"),
      filedAt: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstrFilings, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");

      const [existing] = await db.select().from(gstrFilings)
        .where(dbAnd(dbEq(gstrFilings.id, input.filingId), dbEq(gstrFilings.orgId, org!.id))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Filing record not found" });

      const [row] = await db.update(gstrFilings).set({
        status: "filed",
        arn: input.arn,
        filedAt: input.filedAt ?? new Date(),
        updatedAt: new Date(),
      }).where(dbEq(gstrFilings.id, existing.id)).returning();
      return row;
    }),

    /** Filing history — answers "have we filed this period?". */
    listFilings: permissionProcedure("financial", "read").input(z.object({
      gstinId: z.string().uuid().optional(),
      year: z.number().int().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { gstrFilings, eq: dbEq, and: dbAnd, desc } = await import("@coheronconnect/db");
      const filters = [dbEq(gstrFilings.orgId, org!.id)];
      if (input?.gstinId) filters.push(dbEq(gstrFilings.gstinId, input.gstinId));
      if (input?.year) filters.push(dbEq(gstrFilings.year, input.year));
      return db.select().from(gstrFilings)
        .where(dbAnd(...filters))
        .orderBy(desc(gstrFilings.year), desc(gstrFilings.month));
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
