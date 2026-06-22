/**
 * @coheronconnect/validators — Accounting Zod Schemas
 *
 * Single source of truth for all Accounting/Finance-related validation.
 */
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const AccountTypeEnum = z.enum(["asset", "liability", "equity", "income", "expense"]);
export type AccountType = z.infer<typeof AccountTypeEnum>;

export const AccountSubTypeEnum = z.enum([
  "current_asset", "fixed_asset", "current_liability", "long_term_liability",
  "retained_earnings", "capital", "operating_income", "other_income",
  "cost_of_goods", "operating_expense", "other_expense",
]);
export type AccountSubType = z.infer<typeof AccountSubTypeEnum>;

export const JournalEntryStatusEnum = z.enum(["draft", "posted", "void"]);
export type JournalEntryStatus = z.infer<typeof JournalEntryStatusEnum>;

// ── COA Schemas ───────────────────────────────────────────────────────────────

export const CreateCoaAccountSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(1).max(200),
  type: AccountTypeEnum,
  subType: AccountSubTypeEnum,
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  currency: z.string().length(3).default("INR"),
});
export type CreateCoaAccountInput = z.infer<typeof CreateCoaAccountSchema>;

// ── Journal Entry Schemas ─────────────────────────────────────────────────────

export const JournalLineSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().optional(),
  debit: z.string().default("0"),
  credit: z.string().default("0"),
});
export type JournalLine = z.infer<typeof JournalLineSchema>;

export const CreateJournalEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  description: z.string().min(1, "Description is required"),
  reference: z.string().optional(),
  lines: z.array(JournalLineSchema).min(2, "At least 2 lines required"),
}).refine(
  (data) => {
    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  },
  { message: "Total debits must equal total credits (balanced entry)", path: ["lines"] },
);
export type CreateJournalEntryInput = z.infer<typeof CreateJournalEntrySchema>;
