"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Plus, Search, FileText, ArrowRightLeft,
    Calendar, User, Tag, AlertCircle, CheckCircle2,
    Trash2, PlusCircle, Save, X, RefreshCcw, ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PermissionGate } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";

interface JournalLine {
    accountId: string;
    description: string;
    debit: number;
    credit: number;
}

export default function JournalPage() {
    const [isCreating, setIsCreating] = useState(false);
    const [subject, setSubject] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [lines, setLines] = useState<JournalLine[]>([
        { accountId: "", description: "", debit: 0, credit: 0 },
        { accountId: "", description: "", debit: 0, credit: 0 },
    ]);

    const qJournals = trpc.accounting.journal.list.useQuery({ limit: 50 });
    const qCoa = trpc.accounting.coa.list.useQuery({});

    const mCreate = trpc.accounting.journal.create.useMutation({
        onSuccess: () => {
            toast.success("Journal entry created");
            setIsCreating(false);
            setSubject("");
            setLines([{ accountId: "", description: "", debit: 0, credit: 0 }, { accountId: "", description: "", debit: 0, credit: 0 }]);
            qJournals.refetch();
        },
        onError: (e: any) => toast.error(e.message),
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    const isBalanced = totalDebit === totalCredit && totalDebit > 0;

    const handleAddLine = () => {
        setLines([...lines, { accountId: "", description: "", debit: 0, credit: 0 }]);
    };

    const handleRemoveLine = (index: number) => {
        if (lines.length <= 2) return;
        setLines(lines.filter((_, i) => i !== index));
    };

    const handleUpdateLine = (index: number, field: keyof JournalLine, value: any) => {
        const newLines = [...lines];
        const line = { ...newLines[index] };
        (line as any)[field] = value;
        // If debit is entered, clear credit and vice versa
        if (field === "debit" && value > 0) line.credit = 0;
        if (field === "credit" && value > 0) line.debit = 0;
        newLines[index] = line;
        setLines(newLines);
    };

    const handleSubmit = () => {
        if (!isBalanced) {
            toast.error("Journal entry must be balanced (Debits = Credits)");
            return;
        }
        if (!subject) {
            toast.error("Subject is required");
            return;
        }
        if (lines.some(l => !l.accountId)) {
            toast.error("All lines must have an account selected");
            return;
        }

        mCreate.mutate({
            date: new Date(date || new Date()),
            subject,
            lines: lines.map(l => ({
                accountId: l.accountId,
                description: l.description || subject,
                debit: l.debit.toString(),
                credit: l.credit.toString(),
            })),
        });
    };

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Journal Entries</h1>
                    <p className="text-sm text-muted-foreground mt-1">Record and manage your manual journal entries.</p>
                </div>
                <div className="flex items-center gap-2">
                    {!isCreating && (
                        <PermissionGate module="financial" action="write">
                            <button
                                onClick={() => setIsCreating(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                New Entry
                            </button>
                        </PermissionGate>
                    )}
                </div>
            </div>

            {isCreating ? (
                <div className="bg-card border border-border rounded-xl p-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                        <h2 className="text-lg font-bold">New Journal Entry</h2>
                        <button onClick={() => setIsCreating(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Subject / Narration</label>
                            <input
                                type="text"
                                placeholder="e.g. Monthly Rent Payment"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-4 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-4 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-12 gap-4 px-2">
                            <div className="col-span-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Account</div>
                            <div className="col-span-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</div>
                            <div className="col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Debit</div>
                            <div className="col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Credit</div>
                        </div>

                        <div className="space-y-3">
                            {lines.map((line, index) => (
                                <div key={index} className="grid grid-cols-12 gap-4 items-start group">
                                    <div className="col-span-4">
                                        <select
                                            value={line.accountId}
                                            onChange={(e) => handleUpdateLine(index, "accountId", e.target.value)}
                                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                                        >
                                            <option value="">Select Account...</option>
                                            {qCoa.data?.map((acct: any) => (
                                                <option key={acct.id} value={acct.id}>{acct.code} - {acct.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <input
                                            type="text"
                                            placeholder="Line description..."
                                            value={line.description}
                                            onChange={(e) => handleUpdateLine(index, "description", e.target.value)}
                                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={line.debit || ""}
                                            onChange={(e) => handleUpdateLine(index, "debit", parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-right focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <div className="col-span-2 flex items-center gap-2">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={line.credit || ""}
                                            onChange={(e) => handleUpdateLine(index, "credit", parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-right focus:ring-1 focus:ring-primary outline-none"
                                        />
                                        <button
                                            onClick={() => handleRemoveLine(index)}
                                            className="p-1.5 hover:bg-red-50 text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleAddLine}
                            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                        >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Add Line
                        </button>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-border">
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Debit</p>
                                <p className="text-lg font-mono font-bold">₹{totalDebit.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Credit</p>
                                <p className="text-lg font-mono font-bold">₹{totalCredit.toLocaleString()}</p>
                            </div>
                            <div className={cn(
                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                                {isBalanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                {isBalanced ? "Balanced" : "Unbalanced"}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={mCreate.isPending || !isBalanced}
                                className="flex items-center gap-1.5 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                Save Entry
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-32">Date</th>
                                <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-32">Number</th>
                                <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Subject</th>
                                <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Amount</th>
                                <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {qJournals.isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center">
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <RefreshCcw className="w-4 h-4 animate-spin" />
                                            Loading entries...
                                        </div>
                                    </td>
                                </tr>
                            ) : qJournals.data?.items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                        No journal entries found.
                                    </td>
                                </tr>
                            ) : (
                                qJournals.data?.items.map((je: any) => (
                                    <tr key={je.id} className="hover:bg-muted/30 transition-colors group">
                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {new Date(je.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                                            {je.number}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-foreground">{je.subject}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">{je.sourceType}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold">
                                            ₹{Number(je.totalAmount).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button className="p-1.5 hover:bg-muted rounded transition-colors opacity-0 group-hover:opacity-100">
                                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
