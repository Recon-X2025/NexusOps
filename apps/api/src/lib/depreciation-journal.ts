import {
  assets,
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  eq,
  and,
  inArray,
  sql,
  type DbOrTx,
} from "@coheronconnect/db";
import { getNextYearScopedSeq } from "./auto-number";
import { resolveAssetAccounts } from "./asset-accounts";

/**
 * Posts the general-ledger journal entry for a single period's depreciation
 * charge on a fixed asset. Mirrors `postInvoiceJournalEntry`: runs inside the
 * caller's transaction, posts a balanced double-entry, immediately applies the
 * movement to `currentBalance`, and returns `null` (posting skipped, the charge
 * still succeeds) when the required COA codes are not seeded or the charge is a
 * no-op.
 *
 *   Dr  Depreciation expense     (5500) = charge
 *   Cr  Accumulated Depreciation (1290) = charge   (contra-asset; balance goes negative)
 *
 * Returns the created journal-entry id, or `null` when skipped.
 */
export async function postDepreciationJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    createdById: string | null;
    assetId: string;
    period: number;
    charge: number;
    date: Date;
    financialYear: string;
  },
): Promise<string | null> {
  const { orgId, createdById, assetId, period, charge, date, financialYear } = params;

  // No-op period: nothing to post.
  if (!(charge > 0)) return null;

  /*
   * Accounts come from the asset's own mapping now, not from two hardcoded
   * codes. `resolveAssetAccounts` applies asset override → type default → the
   * 5500/1290 constants this function used to hardcode, so behaviour is
   * unchanged for a tenant that has mapped nothing, while a tenant that HAS
   * mapped (vehicles to one expense line, buildings to another) gets what they
   * configured. One resolver, shared with `assets.create` — a second copy would
   * let the capitalisation and the depreciation of the same asset disagree about
   * which accounts it belongs to.
   */
  const [assetRow] = await tx
    .select({ typeId: assets.typeId })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)));
  if (!assetRow) return null;

  const resolution = await resolveAssetAccounts(tx, {
    orgId,
    typeId: assetRow.typeId,
    assetId,
  });
  // Unresolvable accounts still return null — the caller's `unposted` counter
  // reports it, which stays as the last line of defence. See `runDepreciationForOrg`.
  if (!resolution.ok) return null;
  const codeToId = {
    expense: resolution.accounts.depreciationExpenseAccountId,
    accum: resolution.accounts.accumulatedDepreciationAccountId,
  };

  type Line = { accountId: string; debit: number; credit: number; description: string };
  const lines: Line[] = [
    { accountId: codeToId.expense, debit: charge, credit: 0, description: "Depreciation expense" },
    { accountId: codeToId.accum, debit: 0, credit: charge, description: "Accumulated depreciation" },
  ];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  // Guard the double-entry invariant before writing anything.
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Depreciation journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit} (asset ${assetId}, period ${period})`,
    );
  }

  // The JE number MUST come from the same atomic per-(org, "JE-<year>") counter
  // that `accounting.journal.create` draws on. This used to be `count(*) + 1`,
  // which shares the `JE-YYYY-NNNNN` namespace with that counter while being
  // blind to it — and `je_org_number_idx` is UNIQUE. Reproduced before the fix:
  //
  //   journal.create → JE-2026-00001, JE-2026-00002   (org_counters = 2)
  //   depreciation   → count(*)+1 = 3 → JE-2026-00003 (org_counters still 2)
  //   journal.create → org_counters 2→3 → JE-2026-00003
  //                  → duplicate key value violates "je_org_number_idx"
  //
  // i.e. posting depreciation broke the NEXT manual journal entry with a 500.
  // Harmless only while depreciation was unreachable; this round gives it a
  // screen and a scheduled run, so it had to be closed first.
  const jeYear = date.getFullYear();
  const seq = await getNextYearScopedSeq(tx, orgId, "JE", jeYear, "journal_entries", "number");
  const number = `JE-${jeYear}-${String(seq).padStart(5, "0")}`;

  const [je] = await tx
    .insert(journalEntries)
    .values({
      orgId,
      number,
      date,
      type: "depreciation",
      status: "posted",
      description: `Depreciation period ${period} for asset ${assetId}`,
      reference: `DEPR-${assetId}-P${period}`,
      currency: "INR",
      totalDebit: String(totalDebit),
      totalCredit: String(totalCredit),
      createdById,
      postedById: createdById,
      postedAt: date,
      financialYear,
      period: date.getMonth() + 1,
    })
    .returning();

  await tx.insert(journalEntryLines).values(
    lines.map((l, i) => ({
      journalEntryId: je!.id,
      orgId,
      accountId: l.accountId,
      debitAmount: String(l.debit),
      creditAmount: String(l.credit),
      description: l.description,
      sortOrder: i,
    })),
  );

  for (const l of lines) {
    const net = l.debit - l.credit;
    await tx
      .update(chartOfAccounts)
      .set({ currentBalance: sql`current_balance + ${String(net)}`, updatedAt: new Date() })
      .where(eq(chartOfAccounts.id, l.accountId));
  }

  return je!.id;
}
