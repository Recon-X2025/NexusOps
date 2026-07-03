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
 * Posts the general-ledger journal entry for an invoice.
 *
 * Invoices and the GL were historically decoupled: creating an invoice never
 * touched `chartOfAccounts`, so balance-based dashboards (burn rate, margin,
 * cash runway) read a store that no write path ever populated. This helper
 * closes that gap by posting a balanced double-entry from the invoice's own
 * GST columns, using the deterministic seeded India COA codes.
 *
 * AP (payable) — the org owes a vendor:
 *   Dr  Expenses (5000)                = taxable value
 *   Dr  GST ITC   (1142/1143 | 1141)  = tax (intra: CGST+SGST, inter: IGST)
 *   Cr  Accounts Payable (2110)       = gross total
 *
 * AR (receivable) — a customer owes the org:
 *   Dr  Accounts Receivable (1130)    = gross total
 *   Cr  Revenue (4100)                = taxable value
 *   Cr  GST Payable (2122/2123 | 2121)= tax (intra: CGST+SGST, inter: IGST)
 *
 * Each posting is balanced (Σdebit = Σcredit) and immediately applied to
 * `currentBalance`, mirroring `accounting.journal.post`. Must run inside the
 * same transaction as the invoice insert so the invoice and its GL entry are
 * atomic. Returns the created journal-entry id, or `null` when the required
 * COA accounts are not seeded (the invoice still succeeds; the ledger is
 * simply not posted — surfaced to the caller so it can decide how to react).
 */
export async function postInvoiceJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    createdById: string;
    invoiceFlow: "payable" | "receivable";
    invoiceNumber: string;
    date: Date;
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    isInterstate: boolean;
    grossTotal: number;
    financialYear: string;
  },
): Promise<string | null> {
  const {
    orgId,
    createdById,
    invoiceFlow,
    invoiceNumber,
    date,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    isInterstate,
    grossTotal,
    financialYear,
  } = params;

  // Which COA codes this posting needs, keyed by role.
  const codes =
    invoiceFlow === "payable"
      ? { control: "2110", base: "5000", igst: "1141", cgst: "1142", sgst: "1143" }
      : { control: "1130", base: "4100", igst: "2121", cgst: "2122", sgst: "2123" };

  const wanted = [codes.control, codes.base, codes.igst, codes.cgst, codes.sgst];
  const accts = await tx
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.orgId, orgId), inArray(chartOfAccounts.code, wanted)));
  const codeToId = new Map<string, string>(accts.map((a) => [a.code, a.id]));

  // If the standard accounts aren't seeded we can't post a valid entry.
  for (const c of wanted) {
    if (!codeToId.has(c)) return null;
  }

  const totalTax = cgstAmount + sgstAmount + igstAmount;

  // Build the balanced line set. Debit = positive net, credit = negative net.
  type Line = { accountId: string; debit: number; credit: number; description: string };
  const lines: Line[] = [];

  if (invoiceFlow === "payable") {
    lines.push({ accountId: codeToId.get(codes.base)!, debit: taxableValue, credit: 0, description: "Expense (net)" });
    if (isInterstate) {
      if (igstAmount > 0) lines.push({ accountId: codeToId.get(codes.igst)!, debit: igstAmount, credit: 0, description: "IGST ITC" });
    } else {
      if (cgstAmount > 0) lines.push({ accountId: codeToId.get(codes.cgst)!, debit: cgstAmount, credit: 0, description: "CGST ITC" });
      if (sgstAmount > 0) lines.push({ accountId: codeToId.get(codes.sgst)!, debit: sgstAmount, credit: 0, description: "SGST ITC" });
    }
    lines.push({ accountId: codeToId.get(codes.control)!, debit: 0, credit: grossTotal, description: "Accounts Payable" });
  } else {
    lines.push({ accountId: codeToId.get(codes.control)!, debit: grossTotal, credit: 0, description: "Accounts Receivable" });
    lines.push({ accountId: codeToId.get(codes.base)!, debit: 0, credit: taxableValue, description: "Revenue (net)" });
    if (isInterstate) {
      if (igstAmount > 0) lines.push({ accountId: codeToId.get(codes.igst)!, debit: 0, credit: igstAmount, description: "IGST Payable" });
    } else {
      if (cgstAmount > 0) lines.push({ accountId: codeToId.get(codes.cgst)!, debit: 0, credit: cgstAmount, description: "CGST Payable" });
      if (sgstAmount > 0) lines.push({ accountId: codeToId.get(codes.sgst)!, debit: 0, credit: sgstAmount, description: "SGST Payable" });
    }
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  // Guard the double-entry invariant before writing anything.
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Invoice journal entry is not balanced: debit ${totalDebit} ≠ credit ${totalCredit} (invoice ${invoiceNumber}, tax ${totalTax})`,
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
      type: "invoice",
      status: "posted",
      description: `${invoiceFlow === "payable" ? "Vendor" : "Customer"} invoice ${invoiceNumber}`,
      reference: invoiceNumber,
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
