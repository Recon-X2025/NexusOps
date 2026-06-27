"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Landmark, Plus, Upload, Wand2, Check, X, EyeOff, RefreshCcw,
  CheckCircle2, ArrowLeft, CircleDollarSign,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { CsvImportModal, type ImportField } from "@/components/csv-import-modal";

const BANK_TXN_IMPORT_FIELDS: ImportField[] = [
  { key: "date", label: "Date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", required: true },
];

function fmtInr(n: number | string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n));
}

export default function ReconciliationPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canWrite = can("financial", "write");

  const [accountId, setAccountId] = useState("");
  const [activeStatementId, setActiveStatementId] = useState<string | null>(null);
  const [showNewStatement, setShowNewStatement] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");

  const qCoa = trpc.accounting.coa.list.useQuery({}, mergeTrpcQueryOpts("accounting.coa.list", undefined));
  const bankAccounts = useMemo(
    () => (qCoa.data ?? []).filter((a: any) => a.subType === "bank" || a.subType === "cash"),
    [qCoa.data],
  );

  const qStatements = trpc.accounting.bankRec.listStatements.useQuery(
    accountId ? { accountId } : undefined,
    mergeTrpcQueryOpts("accounting.bankRec.listStatements", undefined),
  );

  const qDetail = trpc.accounting.bankRec.getStatement.useQuery(
    { statementId: activeStatementId! },
    { ...mergeTrpcQueryOpts("accounting.bankRec.getStatement", undefined), enabled: !!activeStatementId },
  );

  const qSuggestions = trpc.accounting.bankRec.suggestMatches.useQuery(
    { statementId: activeStatementId! },
    { ...mergeTrpcQueryOpts("accounting.bankRec.suggestMatches", undefined), enabled: !!activeStatementId },
  );

  const createStatement = trpc.accounting.bankRec.createStatement.useMutation({
    onSuccess: (s: any) => {
      toast.success("Reconciliation session created");
      setShowNewStatement(false);
      setNewName("");
      setNewBalance("");
      qStatements.refetch();
      setActiveStatementId(s.id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importTxns = trpc.accounting.bankRec.importTransactions.useMutation();
  const matchMut = trpc.accounting.bankRec.match.useMutation({
    onSuccess: () => { qDetail.refetch(); qSuggestions.refetch(); qStatements.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const unmatchMut = trpc.accounting.bankRec.unmatch.useMutation({
    onSuccess: () => { qDetail.refetch(); qSuggestions.refetch(); qStatements.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const ignoreMut = trpc.accounting.bankRec.ignore.useMutation({
    onSuccess: () => { qDetail.refetch(); qSuggestions.refetch(); qStatements.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reconcileMut = trpc.accounting.bankRec.reconcile.useMutation({
    onSuccess: () => { toast.success("Statement reconciled"); qDetail.refetch(); qStatements.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const suggestionByTxn = useMemo(() => {
    const m = new Map<string, { journalEntryId: string; score: number; jeNumber: string }>();
    for (const s of qSuggestions.data?.suggestions ?? []) {
      m.set(s.transactionId, { journalEntryId: s.journalEntryId, score: s.score, jeNumber: s.jeNumber });
    }
    return m;
  }, [qSuggestions.data]);

  if (!can("financial", "read")) return <AccessDenied module="Bank Reconciliation" />;

  const detail = qDetail.data;
  const txns = detail?.transactions ?? [];
  const unmatched = txns.filter((t: any) => t.status === "unmatched");
  const matched = txns.filter((t: any) => t.status === "matched");
  const isReconciled = detail?.statement.status === "reconciled";

  function autoMatchAll() {
    const suggestions = qSuggestions.data?.suggestions ?? [];
    if (suggestions.length === 0) {
      toast.info("No confident matches to apply");
      return;
    }
    Promise.all(
      suggestions.map((s) =>
        matchMut.mutateAsync({ transactionId: s.transactionId, journalEntryId: s.journalEntryId, score: s.score }),
      ),
    ).then(() => toast.success(`${suggestions.length} transaction(s) auto-matched`));
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {activeStatementId && (
            <button
              onClick={() => setActiveStatementId(null)}
              className="p-1.5 border border-border rounded hover:bg-muted transition-colors"
              data-testid="back-to-statements"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Landmark className="w-6 h-6 text-primary" />
              Bank Reconciliation
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import bank statements and match transactions against your ledger.
            </p>
          </div>
        </div>
      </div>

      {!activeStatementId ? (
        <>
          {/* Account selector + new statement */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card border border-border p-4 rounded-xl">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bank / Cash Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                data-testid="recon-account-select"
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">All bank/cash accounts</option>
                {bankAccounts.map((acct: any) => (
                  <option key={acct.id} value={acct.id}>{acct.code} - {acct.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <PermissionGate module="financial" action="write">
                <button
                  onClick={() => setShowNewStatement(true)}
                  disabled={bankAccounts.length === 0}
                  data-testid="new-statement-btn"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  New Reconciliation
                </button>
              </PermissionGate>
            </div>
          </div>

          {/* Statements list */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Statement</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Closing Balance</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Matched</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {qStatements.isLoading ? (
                    <tr><td colSpan={4} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <RefreshCcw className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    </td></tr>
                  ) : (qStatements.data?.length ?? 0) === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      No reconciliation sessions yet. Create one to import a bank statement.
                    </td></tr>
                  ) : (
                    qStatements.data!.map((s: any) => (
                      <tr
                        key={s.id}
                        onClick={() => setActiveStatementId(s.id)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        data-testid="statement-row"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{fmtInr(s.statementBalance)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.matchedCount} / {s.txnCount}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold",
                            s.status === "reconciled" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                          )}>
                            {s.status === "reconciled" ? <CheckCircle2 className="w-3 h-3" /> : null}
                            {s.status === "reconciled" ? "Reconciled" : "In Progress"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Detail toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-card border border-border p-4 rounded-xl">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Statement</p>
                <p className="text-sm font-bold text-foreground">{detail?.statement.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transactions</p>
                <p className="text-sm font-bold text-foreground">{txns.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Unmatched</p>
                <p className={cn("text-sm font-bold", unmatched.length > 0 ? "text-amber-600" : "text-green-600")} data-testid="unmatched-count">
                  {unmatched.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PermissionGate module="financial" action="write">
                <button
                  onClick={() => setShowImport(true)}
                  disabled={isReconciled}
                  data-testid="import-txns-btn"
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" /> Import CSV
                </button>
                <button
                  onClick={autoMatchAll}
                  disabled={isReconciled || (qSuggestions.data?.suggestions.length ?? 0) === 0}
                  data-testid="auto-match-btn"
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Wand2 className="w-4 h-4" /> Auto-match ({qSuggestions.data?.suggestions.length ?? 0})
                </button>
                <button
                  onClick={() => reconcileMut.mutate({ statementId: activeStatementId! })}
                  disabled={isReconciled || unmatched.length > 0 || txns.length === 0}
                  data-testid="reconcile-btn"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> Finalize
                </button>
              </PermissionGate>
            </div>
          </div>

          {isReconciled && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> This statement is fully reconciled.
            </div>
          )}

          {/* Transactions table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest w-28">Date</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {qDetail.isLoading ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <RefreshCcw className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    </td></tr>
                  ) : txns.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions yet. Use “Import CSV” to load a bank statement.
                    </td></tr>
                  ) : (
                    txns.map((t: any) => {
                      const sug = suggestionByTxn.get(t.id);
                      const amt = Number(t.amount);
                      return (
                        <tr key={t.id} className="hover:bg-muted/30 transition-colors" data-testid="txn-row">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(t.txnDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-foreground">{t.description}</p>
                            {t.reference && <p className="text-[11px] text-muted-foreground">{t.reference}</p>}
                            {t.status === "unmatched" && sug && (
                              <p className="text-[11px] text-blue-600 mt-0.5 flex items-center gap-1">
                                <Wand2 className="w-3 h-3" /> Suggested: {sug.jeNumber} ({sug.score}%)
                              </p>
                            )}
                          </td>
                          <td className={cn("px-4 py-3 text-right font-mono text-sm font-bold", amt >= 0 ? "text-green-600" : "text-red-600")}>
                            {amt >= 0 ? "+" : ""}{fmtInr(amt)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold",
                              t.status === "matched" ? "bg-green-100 text-green-700"
                                : t.status === "ignored" ? "bg-gray-100 text-gray-600"
                                : "bg-amber-100 text-amber-700",
                            )}>
                              {t.status === "matched" ? "Matched" : t.status === "ignored" ? "Ignored" : "Unmatched"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!isReconciled && (
                              <PermissionGate module="financial" action="write">
                                <div className="flex items-center justify-end gap-1.5">
                                  {t.status === "unmatched" ? (
                                    <>
                                      {sug && (
                                        <button
                                          onClick={() => matchMut.mutate({ transactionId: t.id, journalEntryId: sug.journalEntryId, score: sug.score })}
                                          data-testid="match-btn"
                                          className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-[11px] font-bold hover:bg-green-700 transition-colors"
                                        >
                                          <Check className="w-3 h-3" /> Match
                                        </button>
                                      )}
                                      <button
                                        onClick={() => ignoreMut.mutate({ transactionId: t.id })}
                                        data-testid="ignore-btn"
                                        className="flex items-center gap-1 px-2 py-1 border border-border rounded text-[11px] font-medium hover:bg-muted transition-colors"
                                      >
                                        <EyeOff className="w-3 h-3" /> Ignore
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => unmatchMut.mutate({ transactionId: t.id })}
                                      data-testid="unmatch-btn"
                                      className="flex items-center gap-1 px-2 py-1 border border-border rounded text-[11px] font-medium hover:bg-muted transition-colors"
                                    >
                                      <X className="w-3 h-3" /> Clear
                                    </button>
                                  )}
                                </div>
                              </PermissionGate>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* New statement modal */}
      {showNewStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewStatement(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()} data-testid="new-statement-modal">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-primary" /> New Reconciliation
              </h2>
              <button onClick={() => setShowNewStatement(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  data-testid="modal-account-select"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Select account…</option>
                  {bankAccounts.map((acct: any) => (
                    <option key={acct.id} value={acct.id}>{acct.code} - {acct.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Statement Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. HDFC — Jan 2026"
                  data-testid="statement-name-input"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Closing Balance (₹)</label>
                <input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewStatement(false)} className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => createStatement.mutate({
                  accountId,
                  name: newName.trim(),
                  statementBalance: Number(newBalance) || 0,
                })}
                disabled={!accountId || !newName.trim() || createStatement.isPending}
                data-testid="create-statement-submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import modal */}
      {showImport && activeStatementId && (
        <CsvImportModal
          title="Import Bank Statement"
          fields={BANK_TXN_IMPORT_FIELDS}
          hint="Amount: positive for money received, negative for money paid out."
          onClose={() => setShowImport(false)}
          onImport={async (rows) => {
            const parsed = rows
              .map((r) => {
                const amount = parseFloat((r.amount || "").replace(/[,₹\s]/g, ""));
                const d = new Date(r.date);
                return {
                  txnDate: d,
                  description: r.description,
                  reference: r.reference || undefined,
                  amount,
                  _valid: r.description && !Number.isNaN(amount) && !Number.isNaN(d.getTime()),
                };
              })
              .filter((r) => r._valid)
              .map(({ _valid, ...r }) => r);
            if (parsed.length === 0) {
              toast.error("No valid rows to import");
              return { imported: 0, skipped: rows.length };
            }
            const res = await importTxns.mutateAsync({ statementId: activeStatementId, rows: parsed });
            qDetail.refetch();
            qSuggestions.refetch();
            qStatements.refetch();
            toast.success(`${res.imported} transactions imported`);
            return { imported: res.imported, skipped: rows.length - parsed.length };
          }}
        />
      )}
    </div>
  );
}
