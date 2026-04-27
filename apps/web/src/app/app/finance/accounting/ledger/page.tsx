"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Search, Filter, Calendar, ArrowRightLeft,
    Download, FileText, RefreshCcw, ChevronRight,
    BookOpen, Calculator, TrendingUp, TrendingDown,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export default function LedgerPage() {
    const [accountId, setAccountId] = useState<string>("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const qCoa = trpc.accounting.coa.list.useQuery({});
    const qLedger = trpc.accounting.ledger.useQuery({
        accountId: accountId || undefined,
        startDate: dateFrom ? new Date(dateFrom) : undefined,
        endDate: dateTo ? new Date(dateTo) : undefined,
    }, {
        enabled: !!accountId,
    });

    const selectedAccount = qCoa.data?.find((a: any) => a.id === accountId);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">General Ledger</h1>
                    <p className="text-sm text-muted-foreground mt-1">Detailed transaction history and running balances.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors">
                        <Download className="w-4 h-4" />
                        Export PDF
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors">
                        <FileText className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-card border border-border p-4 rounded-xl">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account</label>
                    <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                    >
                        <option value="">Select Account...</option>
                        {qCoa.data?.map((acct: any) => (
                            <option key={acct.id} value={acct.id}>{acct.code} - {acct.name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">From Date</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">To Date</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div className="flex items-end">
                    <button
                        onClick={() => qLedger.refetch()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                    >
                        <Filter className="w-4 h-4" />
                        Apply Filters
                    </button>
                </div>
            </div>

            {!accountId ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                        <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">Select an Account</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                            Choose an account from the dropdown above to view its general ledger and transaction history.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-card border border-border p-4 rounded-xl space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Opening Balance</p>
                            <p className="text-xl font-mono font-bold text-foreground">₹{Number(selectedAccount?.openingBalance || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-card border border-border p-4 rounded-xl space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Current Balance</p>
                            <p className="text-xl font-mono font-bold text-primary">₹{Number(selectedAccount?.currentBalance || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-card border border-border p-4 rounded-xl space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account Type</p>
                            <p className="text-xl font-bold text-foreground capitalize">{selectedAccount?.type} / {selectedAccount?.subType.replace("_", " ")}</p>
                        </div>
                    </div>

                    {/* Ledger Table */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border">
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-32">Date</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-32">Reference</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Debit</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Credit</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {qLedger.isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center">
                                            <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                                <RefreshCcw className="w-4 h-4 animate-spin" />
                                                Loading ledger...
                                            </div>
                                        </td>
                                    </tr>
                                ) : qLedger.data?.lines.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                            No transactions found for this account in the selected period.
                                        </td>
                                    </tr>
                                ) : (
                                    qLedger.data?.lines.map((line: any, index: number) => (
                                        <tr key={line.id} className="hover:bg-muted/30 transition-colors group">
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {new Date(line.je.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                                                {line.je.number}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-foreground">{line.line.description}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">{line.je.subject}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-sm text-blue-600">
                                                {Number(line.line.debit) > 0 ? `₹${Number(line.line.debit).toLocaleString()}` : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-sm text-red-600">
                                                {Number(line.line.credit) > 0 ? `₹${Number(line.line.credit).toLocaleString()}` : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-sm font-bold">
                                                ₹{Number(line.runningBalance).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
