"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Plus, Search, RefreshCcw, Building2, Wallet,
    ArrowRightLeft, TrendingUp, TrendingDown,
    Filter, Download, FileText, Settings2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate } from "@/lib/rbac-context";
import { cn, pluralize } from "@/lib/utils";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;

import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";

const TYPE_COLORS: Record<string, string> = {
    asset: "text-blue-700 bg-blue-100",
    liability: "text-red-700 bg-red-100",
    equity: "text-purple-700 bg-purple-100",
    income: "text-green-700 bg-green-100",
    expense: "text-orange-700 bg-orange-100",
};

export default function CoaPage() {
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<string | null>(null);
    const [showNew, setShowNew] = useState(false);
    const emptyForm = { code: "", name: "", type: "asset", subType: "", description: "", openingBalance: "0" };
    const [form, setForm] = useState(emptyForm);

    const qCoa = trpc.accounting.coa.list.useQuery({
        type: (filterType || undefined) as "asset" | "liability" | "equity" | "income" | "expense" | undefined,
        limit: 200,
    });

    const mSeed = trpc.accounting.coa.seed.useMutation({
        onSuccess: (data) => {
            toast.success(`Seeded ${data.seeded} accounts successfully`);
            qCoa.refetch();
        },
        onError: (e) => toast.error(e.message),
    });

    const mCreate = trpc.accounting.coa.create.useMutation({
        onSuccess: () => {
            toast.success("Account created");
            setShowNew(false);
            setForm(emptyForm);
            qCoa.refetch();
        },
        onError: (e) => toast.error(e.message),
    });

    const filteredAccounts = qCoa.data?.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.code.includes(search)
    );

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Chart of Accounts"
                subtitle="Manage your financial accounts and categories."
                icon={Building2}
                showBack={false}
                actions={
                    <>
                        <PermissionGate module="financial" action="write">
                            <button
                                onClick={() => mSeed.mutate()}
                                disabled={mSeed.isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                <RefreshCcw className={cn("w-4 h-4", mSeed.isPending && "animate-spin")} />
                                Seed India COA
                            </button>
                            <button
                                onClick={() => { setForm(emptyForm); setShowNew(true); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-body-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Account
                            </button>
                        </PermissionGate>
                    </>
                }
            />

            {/* Filters */}
            <div className="flex items-center gap-4 bg-card border border-border p-3 rounded-xl">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by name or code..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-muted/50 border-none rounded-lg text-body-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div className="flex items-center gap-2 border-l border-border pl-4">
                    {ACCOUNT_TYPES.map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(filterType === type ? null : type)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-caption font-bold uppercase tracking-wider transition-all",
                                filterType === type ? TYPE_COLORS[type] : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                        >
                            {pluralize(type)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table wrapped in ResourceView */}
            <ResourceView
                query={qCoa}
                resourceName="Accounts"
                isEmpty={(data) => !data || data.length === 0}
            >
                {(accounts) => {
                    const displayAccounts = search || filterType ? filteredAccounts : accounts;

                    if (displayAccounts?.length === 0) {
                        return (
                            <div className="p-12 text-center bg-card border border-border rounded-xl">
                                <p className="text-muted-foreground">No accounts found matching your filters.</p>
                            </div>
                        );
                    }

                    return (
                        <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                  <thead>
                                      <tr className="bg-muted/50 border-b border-border">
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest w-24">Code</th>
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest">Account Name</th>
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest">Type</th>
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest">Sub-Type</th>
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest text-right">Balance</th>
                                          <th className="px-4 py-3 text-caption font-bold text-muted-foreground uppercase tracking-widest w-10"></th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                      {displayAccounts?.map(acct => (
                                          <tr key={acct.id} className="hover:bg-muted/30 transition-colors group">
                                              <td className="px-4 py-3 font-mono text-caption text-muted-foreground">{acct.code}</td>
                                              <td className="px-4 py-3">
                                                  <div className="flex items-center gap-2">
                                                      <span className="font-medium text-foreground">{acct.name}</span>
                                                      {acct.isSystem && (
                                                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-bold uppercase rounded">System</span>
                                                      )}
                                                  </div>
                                                  {acct.description && <p className="text-caption text-muted-foreground mt-0.5">{acct.description}</p>}
                                              </td>
                                              <td className="px-4 py-3">
                                                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", TYPE_COLORS[acct.type])}>
                                                      {acct.type}
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3 text-body-sm text-muted-foreground capitalize">{acct.subType.replace("_", " ")}</td>
                                              <td className="px-4 py-3 text-right font-mono text-body-sm font-bold">
                                                  ₹{Number(acct.currentBalance).toLocaleString()}
                                              </td>
                                              <td className="px-4 py-3 text-right" />
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                            </div>
                        </div>
                    );
                }}
            </ResourceView>

            {showNew && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
                        <h2 className="text-body-sm font-semibold mb-4">New Account</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Code *</label>
                                <input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="1100" className="w-full px-3 py-2 text-body-sm border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Account Name *</label>
                                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Bank — HDFC" className="w-full px-3 py-2 text-body-sm border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Type</label>
                                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 text-body-sm border border-border rounded bg-background outline-none capitalize">
                                    {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Opening Balance (₹)</label>
                                <input type="number" value={form.openingBalance} onChange={(e) => setForm(f => ({ ...f, openingBalance: e.target.value }))} className="w-full px-3 py-2 text-body-sm border border-border rounded outline-none" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label>
                                <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 text-body-sm border border-border rounded outline-none" />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-5">
                            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-body-sm border border-border rounded hover:bg-muted/50">Cancel</button>
                            <button
                                disabled={!form.code || !form.name || mCreate.isPending}
                                onClick={() => mCreate.mutate({
                                    code: form.code,
                                    name: form.name,
                                    type: form.type as "asset" | "liability" | "equity" | "income" | "expense",
                                    description: form.description || undefined,
                                    openingBalance: parseFloat(form.openingBalance || "0"),
                                })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-body-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                            >
                                {mCreate.isPending ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
