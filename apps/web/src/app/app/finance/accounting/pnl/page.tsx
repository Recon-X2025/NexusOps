"use client";

/**
 * Profit & Loss — `accounting.profitAndLoss` given a screen.
 *
 * This calls `profitAndLoss`, NOT `incomeStatement`. Both exist on the
 * accounting router and they are not interchangeable: `incomeStatement`
 * declares `startDate`/`endDate`/`financialYear` in its zod input but its
 * handler destructures `{ ctx }` only, so the dates are silently discarded and
 * it always returns inception-to-date off the `currentBalance` snapshot. The
 * orphaned `/app/accounting` page calls it and labels the result a period.
 * `profitAndLoss` is the period-accurate one — it sums posted journal-entry
 * lines inside the window.
 *
 * Columns are exactly what the procedure returns: account, code, amount. No
 * prior-period column, no percentage-of-revenue, no variance — the procedure
 * returns no comparatives, and a column nothing fills is a lie.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, TrendingUp, TrendingDown, Scale, BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { StatementPeriodPicker } from "@/components/financial/statement-period";
import {
    formatStatementInr,
    monthKeyToday,
    monthStart,
    monthEnd,
    monthLabel,
} from "@/lib/format-money";
import { cn } from "@/lib/utils";

type PnlRow = {
    id: string;
    code: string;
    name: string;
    subType: string | null;
    amount: number;
};

function PnlSection({
    title,
    rows,
    total,
    totalLabel,
    ledgerHref,
    tone,
    testId,
}: {
    title: string;
    rows: PnlRow[];
    total: number;
    totalLabel: string;
    ledgerHref: (accountId: string) => string;
    tone: "income" | "expense";
    testId: string;
}) {
    const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center gap-2">
                {tone === "income" ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                    <TrendingDown className="w-4 h-4 text-orange-600" />
                )}
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
                        {sorted.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-body-sm text-muted-foreground">
                                    No {title.toLowerCase()} posted in this period.
                                </td>
                            </tr>
                        ) : (
                            sorted.map((r) => (
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
                                        data-testid={`pnl-amount-${r.code}`}
                                        className="px-4 py-2.5 text-right font-mono text-body-sm"
                                    >
                                        {formatStatementInr(r.amount)}
                                    </td>
                                </tr>
                            ))
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
        </div>
    );
}

export default function ProfitAndLossPage() {
    const { mergeTrpcQueryOpts } = useRBAC();
    const [month, setMonth] = useState(monthKeyToday());

    const startDate = useMemo(() => monthStart(month), [month]);
    const endDate = useMemo(() => monthEnd(month), [month]);

    /**
     * A financial statement must never render from cache.
     *
     * The app-wide default is `staleTime: 10s` with `refetchOnMount: true`,
     * which is right for a ticket list and wrong here: post an entry, click
     * through to the P&L, and the screen can show the figures from before the
     * posting — with no indication that it is doing so. On a list that is a
     * moment of lag; on a statement it is a wrong number presented as the
     * accounts. `staleTime: 0` + `refetchOnMount: "always"` makes every arrival
     * on this screen re-read the ledger.
     */
    const alwaysFresh = { staleTime: 0, refetchOnMount: "always" as const };

    const qPnl = trpc.accounting.profitAndLoss.useQuery(
        { startDate, endDate },
        mergeTrpcQueryOpts("accounting.profitAndLoss", alwaysFresh),
    );

    const qPeriods = trpc.financial.periodClose.get.useQuery(
        undefined,
        mergeTrpcQueryOpts("financial.periodClose.get", alwaysFresh),
    );

    // The procedure drops zero-amount lines, so an empty result is ambiguous:
    // no postings at all, or postings that net to nil. Ask the journal.
    const qPosted = trpc.accounting.journal.list.useQuery(
        { status: "posted", startDate, endDate, limit: 1 },
        mergeTrpcQueryOpts("accounting.journal.list", alwaysFresh),
    );

    const isClosed = Boolean(qPeriods.data?.closedPeriods?.includes(month));
    const postedCount = qPosted.data?.total ?? 0;

    const ledgerHref = (accountId: string) =>
        `/app/finance/accounting/ledger?accountId=${accountId}` +
        `&from=${startDate.toISOString().slice(0, 10)}` +
        `&to=${endDate.toISOString().slice(0, 10)}`;

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                // A plain string prop, not JSX text — an HTML entity here would
                // render literally as "Profit &amp; Loss".
                title="Profit & Loss"
                subtitle="Income and expenses posted within the selected period. Posted entries only — drafts are excluded."
                icon={FileText}
                showBack={false}
                actions={
                    <Link
                        href="/app/finance/accounting/balance-sheet"
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors"
                    >
                        <Scale className="w-4 h-4" />
                        Balance Sheet
                    </Link>
                }
            />

            <StatementPeriodPicker
                month={month}
                onMonthChange={setMonth}
                isClosed={isClosed}
                asAtNote={`1 to end of ${monthLabel(month)}`}
                testId="pnl-period"
            />

            <ResourceView query={qPnl} resourceName="Profit and loss">
                {(pnl) => {
                    const income = pnl.income as PnlRow[];
                    const expenses = pnl.expenses as PnlRow[];

                    if (income.length === 0 && expenses.length === 0) {
                        return (
                            <div
                                data-testid="pnl-empty"
                                className="bg-card border border-border rounded-xl p-12 text-center space-y-4"
                            >
                                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                                    <FileText className="w-8 h-8 text-muted-foreground/50" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-body-lg font-bold text-foreground">
                                        No income or expenses in {monthLabel(month)}
                                    </h3>
                                    <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
                                        {postedCount === 0
                                            ? "No journal entries were posted in this period at all."
                                            : `${postedCount} entr${postedCount === 1 ? "y was" : "ies were"} posted in this period, but none of them touched an income or expense account (a balance-sheet-only movement, such as a transfer between bank accounts).`}{" "}
                                        A P&amp;L is built from <strong>posted</strong> entries; drafts never
                                        reach it.
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

                    return (
                        <div className="space-y-6">
                            <PnlSection
                                title="Income"
                                rows={income}
                                total={pnl.totalIncome}
                                totalLabel="Total income"
                                ledgerHref={ledgerHref}
                                tone="income"
                                testId="pnl-total-income"
                            />

                            <PnlSection
                                title="Expenses"
                                rows={expenses}
                                total={pnl.totalExpenses}
                                totalLabel="Total expenses"
                                ledgerHref={ledgerHref}
                                tone="expense"
                                testId="pnl-total-expenses"
                            />

                            <div
                                className={cn(
                                    "rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3",
                                    pnl.netProfit >= 0
                                        ? "border-green-200 bg-green-50"
                                        : "border-orange-200 bg-orange-50",
                                )}
                            >
                                <p
                                    className={cn(
                                        "text-body-sm font-bold uppercase tracking-wider",
                                        pnl.netProfit >= 0 ? "text-green-800" : "text-orange-800",
                                    )}
                                >
                                    {pnl.netProfit >= 0 ? "Net profit" : "Net loss"} for {monthLabel(month)}
                                </p>
                                <p
                                    data-testid="pnl-net-profit"
                                    className={cn(
                                        "font-mono text-h4 font-bold",
                                        pnl.netProfit >= 0 ? "text-green-800" : "text-orange-800",
                                    )}
                                >
                                    {formatStatementInr(pnl.netProfit)}
                                </p>
                            </div>

                            <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    How these figures were built
                                </p>
                                <p className="text-caption text-muted-foreground">
                                    Each line is a single income or expense account. Its amount is the sum of
                                    every posted journal-entry line on that account dated within{" "}
                                    {monthLabel(month)}; drafts are excluded, and accounts with no movement in
                                    the period are omitted rather than shown as nil. Click an account name to
                                    open its General Ledger filtered to the same dates — those are the lines
                                    that were summed. The Balance Sheet&apos;s <em>Current Period Earnings</em>{" "}
                                    is the same calculation run from inception to the period end, so it equals
                                    this net figure only when the selected period covers every entry ever
                                    posted.
                                </p>
                            </div>
                        </div>
                    );
                }}
            </ResourceView>
        </div>
    );
}
