"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Scale } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { TableSkeleton } from "@coheronconnect/ui";
import { PageHeader } from "@/components/ui/page-header";
import { formatInr } from "@/lib/utils";

/**
 * Trial Balance — `accounting.trialBalance` given a screen with a navigation
 * path. Like GSTR generation, its only caller was a tab on the orphaned
 * `/app/accounting` page, which no sidebar entry points at.
 *
 * The as-of-date control is real. `accounting.trialBalance` originally declared
 * `asOfDate` and ignored it, so this screen shipped without a picker rather than
 * offer a control that silently changed nothing. The procedure now honours the
 * date on the same basis as `balanceSheet` — opening balance plus posted movements
 * up to that date — so the control is wired.
 *
 * Leaving the date empty gives the inception-to-date snapshot, which is what the
 * subtitle then says.
 */

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
    asset: "text-blue-700 bg-blue-100",
    liability: "text-red-700 bg-red-100",
    equity: "text-purple-700 bg-purple-100",
    income: "text-green-700 bg-green-100",
    expense: "text-orange-700 bg-orange-100",
    contra_asset: "text-blue-600 bg-blue-50",
    contra_liability: "text-red-600 bg-red-50",
};

export default function TrialBalancePage() {
    const { can } = useRBAC();
    if (!can("financial", "read")) return <AccessDenied module="Trial Balance" />;
    return <TrialBalancePageInner />;
}

function TrialBalancePageInner() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const [asOf, setAsOf] = useState("");

    // A financial statement must never render from cache — same reasoning as the
    // P&L and Balance Sheet screens.
    const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };

    const tbQ = trpc.accounting.trialBalance.useQuery(
        // `journal_entries.date` is a timestamptz filtered with `lte`, so a bare
        // `new Date("2026-08-31")` is midnight UTC and would drop entries stamped
        // later that day — the same trap the ledger screen documents. The chosen
        // date must INCLUDE that day, or a month-end trial balance silently
        // disagrees with the month-end balance sheet.
        asOf ? { asOfDate: new Date(`${asOf}T23:59:59.999Z`) } : {},
        mergeTrpcQueryOpts("accounting.trialBalance", alwaysFresh),
    );
    const data = tbQ.data as any;

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Trial Balance"
                subtitle={
                    asOf
                        ? "Debit and credit balances for every account, from posted entries up to the selected date."
                        : "Debit and credit balances for every account, as at today. Inception-to-date — not restricted to a period."
                }
                icon={Scale}
            />

            <div className="flex items-end gap-2">
                <div>
                    <label htmlFor="tb-as-of" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        As at
                    </label>
                    <input
                        id="tb-as-of"
                        type="date"
                        value={asOf}
                        onChange={(e) => setAsOf(e.target.value)}
                        className="mt-1 block border border-border rounded px-2 py-1.5 text-[12px] bg-background text-foreground outline-none"
                    />
                </div>
                {asOf && (
                    <button
                        onClick={() => setAsOf("")}
                        className="px-2 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                    >
                        Clear
                    </button>
                )}
            </div>

            {tbQ.isLoading ? (
                <TableSkeleton rows={10} cols={5} />
            ) : !data ? null : (
                <div className="flex flex-col gap-3">
                    <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] ${
                            data.isBalanced
                                ? "bg-green-50 border-green-200 text-green-700"
                                : "bg-red-50 border-red-200 text-red-700"
                        }`}
                    >
                        {data.isBalanced
                            ? "✓ Trial balance is balanced"
                            : `⚠ Trial balance is out of balance by ${formatInr(Math.abs(data.totalDebit - data.totalCredit))}`}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-[12px]">
                            <thead className="bg-muted/40 border-b border-border">
                                <tr>
                                    {["Code", "Account Name", "Type", "Debit (₹)", "Credit (₹)"].map((h) => (
                                        <th
                                            key={h}
                                            className={`px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ${
                                                h.includes("₹") ? "text-right" : "text-left"
                                            }`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {(data.lines as any[])
                                    .filter((l: any) => l.debit !== 0 || l.credit !== 0)
                                    .map((line: any) => (
                                        <tr key={line.id} className="bg-card hover:bg-muted/20 transition-colors">
                                            <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{line.code}</td>
                                            <td className="px-3 py-2 font-medium text-foreground">{line.name}</td>
                                            <td className="px-3 py-2">
                                                <span
                                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                                                        ACCOUNT_TYPE_COLORS[line.type] ?? ""
                                                    }`}
                                                >
                                                    {line.type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-foreground">
                                                {line.debit > 0 ? formatInr(line.debit) : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-foreground">
                                                {line.credit > 0 ? formatInr(line.credit) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                            <tfoot className="bg-muted/60 border-t border-border font-bold">
                                <tr>
                                    <td colSpan={3} className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">
                                        Totals
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-foreground">{formatInr(data.totalDebit)}</td>
                                    <td className="px-3 py-2.5 text-right font-mono text-foreground">{formatInr(data.totalCredit)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
