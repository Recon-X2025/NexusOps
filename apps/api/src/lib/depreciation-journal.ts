import {
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  eq,
  and,
  inArray,
  count as dbCount,
  sql,
  type DbOrTx,
} from "@coheronconnect/db";

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

  const codes = { expense: "5500", accum: "1290" };
  const wanted = [codes.expense, codes.accum];
  const accts = await tx
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), inArray(chartOfAccounts.code, wanted)));
  const codeToId = new Map<string, string>(accts.map((a) => [a.code, a.id]));

  // If the standard accounts aren't seeded we can't post a valid entry.
  for (const c of wanted) {
    if (!codeToId.has(c)) return null;
  }

  type Line = { accountId: string; debit: number; credit: number; description: string };
  const lines: Line[] = [
    { accountId: codeToId.get(codes.expense)!, debit: charge, credit: 0, description: "Depreciation expense" },
    { accountId: codeToId.get(codes.accum)!, debit: 0, credit: charge, description: "Accumulated depreciation" },
  ];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  // Guard the double-entry invariant before writing anything.
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Depreciation journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit} (asset ${assetId}, period ${period})`,
    );
  }

  const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(eq(journalEntries.orgId, orgId));
  const seq = (c?.n ?? 0) + 1;
  const number = `JE-${date.getFullYear()}-${String(seq).padStart(5, "0")}`;

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
