/**
 * Capitalise a fixed asset: the journal entry that puts it on the books.
 *
 * ── The defect this closes ──────────────────────────────────────────────────
 * `assets.create` inserted the asset row and a history row and posted NOTHING.
 * It is the only product path that creates an asset, so EVERY asset was absent
 * from the general ledger and the balance sheet was short by the cost of
 * everything the company owned.
 *
 * Depreciation made it visibly wrong rather than merely incomplete: the charge
 * credits 1290 Accumulated Depreciation, so the sheet carried a contra-asset
 * with no gross asset behind it — a negative balance for an asset that, as far
 * as the books were concerned, had never been bought.
 *
 *   Dr  <resolved asset account>      = purchase cost   (e.g. 1200 / 1210)
 *   Cr  2110 Accounts Payable (Trade) = purchase cost
 *
 * ── Why Accounts Payable and not Bank ───────────────────────────────────────
 * Recording an asset does not assert that money left a bank account. The asset
 * may be on credit, against a purchase order, or already paid by a separate
 * transaction. Crediting Bank would invent a payment and corrupt the balance
 * that bank reconciliation ties out against a real statement — a number a human
 * checks against a real document. Crediting AP states only what is certainly
 * true at the moment of acquisition: the organisation owes for this asset. Any
 * later payment is its own entry (Dr AP, Cr Bank) raised on the path that
 * actually knows a payment happened.
 *
 * Returns the journal-entry id, or `null` when nothing should be posted.
 */

import {
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  eq,
  and,
  sql,
  type DbOrTx,
} from "@coheronconnect/db";
import { getNextYearScopedSeq } from "./auto-number";
import { ACQUISITION_CREDIT_CODE } from "./asset-accounts";

export type AcquisitionPostResult =
  | { posted: true; journalEntryId: string }
  /**
   * Why nothing was posted. A capitalisation that degrades to nothing must SAY
   * so — the depreciation poster returned a bare `null` when its accounts were
   * missing, and the charge recorded while the ledger never moved.
   */
  | { posted: false; reason: "no_cost" | "credit_account_missing" };

export async function postAssetAcquisitionEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    createdById: string | null;
    assetId: string;
    assetTag: string;
    assetName: string;
    assetAccountId: string;
    cost: number;
    date: Date;
    financialYear: string;
  },
): Promise<AcquisitionPostResult> {
  const { orgId, createdById, assetId, assetTag, assetName, assetAccountId, cost, date, financialYear } =
    params;

  // `purchaseCost` is optional on the form. An asset with no cost has nothing to
  // capitalise — posting a zero-value entry would put a meaningless row in the
  // ledger and imply the asset is worth nothing. Post nothing, and say why.
  if (!(cost > 0)) return { posted: false, reason: "no_cost" };

  const [creditAccount] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, ACQUISITION_CREDIT_CODE)));
  if (!creditAccount) return { posted: false, reason: "credit_account_missing" };

  const lines = [
    { accountId: assetAccountId, debit: cost, credit: 0, description: `Capitalised ${assetTag} — ${assetName}` },
    { accountId: creditAccount.id, debit: 0, credit: cost, description: `Payable for ${assetTag}` },
  ];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Asset acquisition entry is not balanced: debit ${totalDebit} != credit ${totalCredit} (asset ${assetId})`,
    );
  }

  // The JE number MUST come from the same atomic per-(org, year) counter that
  // `accounting.journal.create` draws on. `count(*) + 1` shares the JE-YYYY-NNNNN
  // namespace while being blind to it, and `je_org_number_idx` is UNIQUE — which
  // is exactly how the depreciation poster used to poison the next manual entry.
  const jeYear = date.getFullYear();
  const seq = await getNextYearScopedSeq(tx, orgId, "JE", jeYear, "journal_entries", "number");
  const number = `JE-${jeYear}-${String(seq).padStart(5, "0")}`;

  const [je] = await tx
    .insert(journalEntries)
    .values({
      orgId,
      number,
      date,
      type: "manual",
      status: "posted",
      description: `Asset capitalisation — ${assetTag} ${assetName}`,
      reference: `ASSET-${assetTag}`,
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

  return { posted: true, journalEntryId: je!.id };
}
