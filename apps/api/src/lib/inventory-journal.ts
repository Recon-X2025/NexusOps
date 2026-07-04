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
 * Posts the cost-of-goods-sold journal entry when inventory is issued/consumed.
 * Mirrors `postInvoiceJournalEntry`: runs inside the caller's transaction, posts
 * a balanced double-entry, immediately applies the movement to `currentBalance`,
 * and returns `null` (posting skipped, the issue still succeeds) when the COGS
 * is a no-op or the required COA codes are not seeded.
 *
 *   Dr  Cost of Revenue (COGS) (5100) = cogs
 *   Cr  Inventory (asset)      (1170) = cogs
 *
 * `1170 Inventory` must be present in the seeded India COA (see accounting.ts).
 * Returns the created journal-entry id, or `null` when skipped.
 */
export async function postInventoryCogsJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    createdById: string | null;
    itemId: string;
    cogs: number;
    date: Date;
    financialYear: string;
    reference?: string;
  },
): Promise<string | null> {
  const { orgId, createdById, itemId, cogs, date, financialYear, reference } = params;

  // No-op issue: nothing to post.
  if (!(cogs > 0)) return null;

  const codes = { cogs: "5100", inventory: "1170" };
  const wanted = [codes.cogs, codes.inventory];
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
    { accountId: codeToId.get(codes.cogs)!, debit: cogs, credit: 0, description: "Cost of goods sold" },
    { accountId: codeToId.get(codes.inventory)!, debit: 0, credit: cogs, description: "Inventory issued" },
  ];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  // Guard the double-entry invariant before writing anything.
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Inventory COGS journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit} (item ${itemId})`,
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
      // No dedicated "inventory"/"cogs" enum value; use the generic "manual".
      type: "manual",
      status: "posted",
      description: `COGS on inventory issue (item ${itemId})`,
      reference: reference ?? null,
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
