"use client";

/**
 * Balance Sheet — `accounting.balanceSheet` given a screen.
 *
 * The engine has been correct and unreachable: no route, no nav entry, no
 * caller anywhere in `apps/web`. It self-balanced in tests, which is not the
 * same as balancing on entries someone actually posted.
 *
 * Two things this screen refuses to do:
 *
 *  1. **Render a wrong statement quietly.** If assets do not equal liabilities
 *     plus equity, the check banner turns red and says so before the numbers.
 *     A balance sheet that silently does not balance is worse than no balance
 *     sheet, because its whole claim to authority is that identity.
 *  2. **Render zeroes as if they were a statement.** A fresh tenant has posted
 *     nothing; a page of ₹0.00 lines looks exactly like the accounts of a
 *     company worth nothing. It gets an empty state that says which it is.
 *
 * Figures are traceable: every line is one account (code + name), and each
 * links to that account's General Ledger up to the same date, where the closing
 * running balance is the figure on this line — the same arithmetic, since
 * `balanceSheet({asOfDate})` derives balances as `openingBalance + posted
 * movements ≤ asOfDate`, exactly as `ledger` does.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Scale, CheckCircle2, AlertTriangle, BookOpen, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { StatementPeriodPicker } from "@/components/financial/statement-period";
import {
    formatStatementInr,
    monthKeyToday,
    monthEnd,
    dateLabel,
} from "@/lib/format-money";
import { cn } from "@/lib/utils";

type SectionRow = {
    id: string;
    code: string;
    name: string;
    type: string;
    subType: string | null;
    balance: number;
};

/** Presentation sign per section. Liabilities and equity are credit-normal and
 *  stored negative; a statement shows them positive. */
function presented(row: SectionRow, flip: boolean): number {
    const v = flip ? -row.balance : row.balance;
    return v === 0 ? 0 : v;
}

function SectionTable({
    title,
    rows,
    total,
    totalLabel,
    flipSign,
    ledgerHref,
    extraRow,
    testId,
}: {
    title: string;
    rows: SectionRow[];
    total: number;
    totalLabel: string;
    flipSign: boolean;
    ledgerHref: (accountId: string) => string;
    /** The synthetic equity line. Not an account — rendered, and labelled as derived. */
    extraRow?: { label: string; amount: number; note: string };
    testId: string;
}) {
    const shown = rows
        .filter((r) => Number(r.balance) !== 0)
        .sort((a, b) => a.code.localeCompare(b.code));
    const hidden = rows.length - shown.length;

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/50 border-b border-border">
                <h2 className="text-body-sm font-bold uppercase tracking-widest text-muted-foreground">
                    {title}
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest w-24">Code</th>
                            <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest">Account</th>
                            <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest w-52">Sub-Type</th>
                            <th className="px-4 py-2 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right w-44">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {shown.length === 0 && !extraRow && (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-body-sm text-muted-foreground">
                                    No {title.toLowerCase()} with a balance as at this date.
                                </td>
                            </tr>
                        )}
                        {shown.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-caption text-muted-foreground">{r.code}</td>
                                <td className="px-4 py-2.5">
                                    <Link
                                        href={ledgerHref(r.id)}
                                        className="text-body-sm font-medium text-foreground hover:text-primary hover:underline"
                                    >
                                        {r.name}
                                    </Link>
                                </td>
                                <td className="px-4 py-2.5 text-body-sm text-muted-foreground capitalize">
                                    {(r.subType ?? "—").replace(/_/g, " ")}
                                </td>
                                <td
                                    data-testid={`bs-amount-${r.code}`}
                                    className="px-4 py-2.5 text-right font-mono text-body-sm"
                                >
                                    {formatStatementInr(presented(r, flipSign))}
                                </td>
                            </tr>
                        ))}
                        {extraRow && (
                            <tr className="bg-muted/20">
                                <td className="px-4 py-2.5 font-mono text-caption text-muted-foreground">—</td>
                                <td className="px-4 py-2.5">
                                    <p className="text-body-sm font-medium text-foreground">{extraRow.label}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{extraRow.note}</p>
                                </td>
                                <td className="px-4 py-2.5 text-body-sm text-muted-foreground">Derived</td>
                                <td
                                    data-testid="bs-current-period-earnings"
                                    className="px-4 py-2.5 text-right font-mono text-body-sm"
                                >
                                    {formatStatementInr(extraRow.amount)}
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40">
                            <td colSpan={3} className="px-4 py-3 text-body-sm font-bold uppercase tracking-wider">
                                {totalLabel}
                            </td>
                            <td
                                data-testid={testId}
                                className="px-4 py-3 text-right font-mono text-body-sm font-bold"
                            >
                                {formatStatementInr(total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {hidden > 0 && (
                <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
                    {hidden} account{hidden === 1 ? "" : "s"} with a nil balance not shown.
                </p>
            )}
        </div>
    );
}

export default function BalanceSheetPage() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const [month, setMonth] = useState(monthKeyToday());

    const asOf = useMemo(() => monthEnd(month), [month]);

    /**
     * A financial statement must never render from cache. The app-wide default
     * is `staleTime: 10s` with `refetchOnMount: true`, which is right for a
     * ticket list and wrong here: post an entry, click through to the balance
     * sheet, and the screen can show the position from before the posting with
     * nothing to say it is doing so. `staleTime: 0` + `refetchOnMount:
     * "always"` makes every arrival on this screen re-read the ledger.
     */
    const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };

    const qBs = trpc.accounting.balanceSheet.useQuery(
        { asOfDate: asOf },
        mergeTrpcQueryOpts("accounting.balanceSheet", alwaysFresh),
    );

    const qPeriods = trpc.financial.periodClose.get.useQuery(
        undefined,
        mergeTrpcQueryOpts("financial.periodClose.get", alwaysFresh),
    );

    // "Is there anything posted at all?" — asked of the journal, not inferred
    // from a zero total, because zero is a legitimate balance.
    const qPosted = trpc.accounting.journal.list.useQuery(
        { status: "posted", endDate: asOf, limit: 1 },
        mergeTrpcQueryOpts("accounting.journal.list", alwaysFresh),
    );

    const isClosed = Boolean(qPeriods.data?.closedPeriods?.includes(month));
    const postedCount = qPosted.data?.total ?? 0;

    const ledgerHref = (accountId: string) =>
        `/app/finance/accounting/ledger?accountId=${accountId}&to=${asOf.toISOString().slice(0, 10)}`;

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Balance Sheet"
                subtitle="Assets, liabilities and equity as at the end of the selected period. Posted entries only — drafts are excluded."
                icon={Scale}
                showBack={false}
                actions={
                    <Link
                        href="/app/finance/accounting/pnl"
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Profit &amp; Loss
                    </Link>
                }
            />

            <StatementPeriodPicker
                month={month}
                onMonthChange={setMonth}
                isClosed={isClosed}
                asAtNote={`as at ${dateLabel(asOf)}`}
                testId="bs-period"
            />

            <ResourceView query={qBs} resourceName="Balance sheet">
                {(bs) => {
                    const assetRows = bs.assets.rows as SectionRow[];
                    const liabilityRows = bs.liabilities.rows as SectionRow[];
                    const equityRows = bs.equity.rows as SectionRow[];

                    const nothingToShow =
                        bs.totalAssets === 0 &&
                        bs.liabilities.total === 0 &&
                        bs.equity.total === 0 &&
                        ![...assetRows, ...liabilityRows, ...equityRows].some(
                            (r) => Number(r.balance) !== 0,
                        );

                    if (nothingToShow) {
                        return (
                            <div
                                data-testid="bs-empty"
                                className="bg-card border border-border rounded-xl p-12 text-center space-y-4"
                            >
                                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                    <Scale className="w-8 h-8 text-muted-foreground/50" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-body-lg font-bold text-foreground">
                                        Nothing on the books as at {dateLabel(asOf)}
                                    </h3>
                                    <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
                                        {postedCount === 0
                                            ? "No journal entries have been posted on or before this date, and no account carries an opening balance. This is an empty set of books, not a company with nothing in it."
                                            : "Every account nets to nil as at this date — postings exist but cancel out."}{" "}
                                        A balance sheet is built from <strong>posted</strong> entries; drafts
                                        never reach it.
                                    </p>
                                </div>
                                <Link
                                    href="/app/finance/accounting/journal"
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-body-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    <BookOpen className="w-4 h-4" />
                                    Go to Journal Entries
                                </Link>
                            </div>
                        );
                    }

                    const difference = bs.totalAssets - bs.totalLiabilitiesAndEquity;

                    return (
                        <div className="space-y-6">
                            {/* The check comes FIRST and is unmissable when it fails. */}
                            <div
                                data-testid="bs-balance-check"
                                data-balanced={bs.isBalanced ? "true" : "false"}
                                role={bs.isBalanced ? undefined : "alert"}
                                className={cn(
                                    "rounded-xl border p-4",
                                    bs.isBalanced
                                        ? "border-green-200 bg-green-50"
                                        : "border-red-300 bg-red-50",
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {bs.isBalanced ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex-1 space-y-2">
                                        <p
                                            className={cn(
                                                "text-body-sm font-bold uppercase tracking-wider",
                                                bs.isBalanced ? "text-green-800" : "text-red-800",
                                            )}
                                        >
                                            {bs.isBalanced
                                                ? "Balanced — assets equal liabilities plus equity"
                                                : "DOES NOT BALANCE — do not rely on this statement"}
                                        </p>
                                        {!bs.isBalanced && (
                                            <p className="text-body-sm text-red-800">
                                                Assets are out by{" "}
                                                <strong className="font-mono">
                                                    {formatStatementInr(difference)}
                                                </strong>
                                                . Every posted journal entry is balanced by validation, so a
                                                difference here comes from opening balances that were entered
                                                on the Chart of Accounts without an offsetting entry. Check
                                                account opening balances before using these figures.
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-x-8 gap-y-1 font-mono text-body-sm">
                                            <span>
                                                <span className="text-muted-foreground">Assets </span>
                                                {formatStatementInr(bs.totalAssets)}
                                            </span>
                                            <span>
                                                <span className="text-muted-foreground">
                                                    Liabilities + Equity{" "}
                                                </span>
                                                {formatStatementInr(bs.totalLiabilitiesAndEquity)}
                                            </span>
                                            <span>
                                                <span className="text-muted-foreground">Difference </span>
                                                {formatStatementInr(difference)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <SectionTable
                                title="Assets"
                                rows={assetRows}
                                total={bs.assets.total}
                                totalLabel="Total assets"
                                flipSign={false}
                                ledgerHref={ledgerHref}
                                testId="bs-total-assets"
                            />

                            <SectionTable
                                title="Liabilities"
                                rows={liabilityRows}
                                total={bs.liabilities.total}
                                totalLabel="Total liabilities"
                                flipSign
                                ledgerHref={ledgerHref}
                                testId="bs-total-liabilities"
                            />

                            <SectionTable
                                title="Equity"
                                rows={equityRows}
                                total={bs.equity.total}
                                totalLabel="Total equity"
                                flipSign
                                ledgerHref={ledgerHref}
                                extraRow={{
                                    label: "Current Period Earnings",
                                    amount: bs.equity.currentPeriodEarnings,
                                    note: "Income less expenses on all posted entries up to this date — not the selected month alone. Not a ledger account: it is the figure that would be swept to Retained Earnings at close.",
                                }}
                                testId="bs-total-equity"
                            />

                            <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    How these figures were built
                                </p>
                                <p className="text-caption text-muted-foreground">
                                    Each line is a single account from the Chart of Accounts. Its balance is
                                    the account&apos;s opening balance plus every posted journal-entry line
                                    dated on or before {dateLabel(asOf)}; drafts and reversed originals are
                                    excluded. Click an account name to open its General Ledger to the same
                                    date, where the closing running balance is the figure shown here.
                                    Contra-asset accounts (e.g. accumulated depreciation) carry a negative
                                    balance and net down total assets.
                                </p>
                            </div>
                        </div>
                    );
                }}
            </ResourceView>
        </div>
    );
}
