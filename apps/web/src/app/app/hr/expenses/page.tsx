"use client";

export const dynamic = "force-dynamic";

import { useState, type ElementType } from "react";
import {
  Receipt, Plus, Search, Download, RefreshCw, CheckCircle2, XCircle, Clock,
  Loader2, FileText, DollarSign, ThumbsUp, ThumbsDown, UserCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { EmptyState, Pagination, TableSkeleton } from "@coheronconnect/ui";

const STATUS_CFG: Record<string, { label: string; color: string; icon: ElementType }> = {
  draft:        { label: "Draft",             color: "text-muted-foreground bg-muted",   icon: FileText },
  submitted:    { label: "Awaiting Manager",  color: "text-blue-700 bg-blue-100",        icon: Clock },
  under_review: { label: "Awaiting Finance",  color: "text-yellow-700 bg-yellow-100",    icon: UserCheck },
  approved:     { label: "Finance Approved",  color: "text-green-700 bg-green-100",      icon: CheckCircle2 },
  rejected:     { label: "Rejected",          color: "text-red-700 bg-red-100",          icon: XCircle },
  reimbursed:   { label: "Reimbursed",        color: "text-purple-700 bg-purple-100",    icon: CheckCircle2 },
};

// Inline pipeline stage label shown inside the title cell
const STAGE_LABELS: Record<string, { text: string; color: string }> = {
  submitted:    { text: "Step 1 of 3 · Awaiting Manager Approval",           color: "text-blue-600 bg-blue-50 border-blue-200" },
  under_review: { text: "Step 2 of 3 · Manager Approved · Awaiting Finance", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  approved:     { text: "Step 3 of 3 · Finance Approved · Pending Payment",  color: "text-green-700 bg-green-50 border-green-200" },
};

const CATEGORIES = [
  "travel", "accommodation", "food", "fuel", "communication",
  "office_supplies", "client_entertainment", "training", "medical", "miscellaneous",
];

function fmtInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

/**
 * Expense Reimbursements page — 2-level approval pipeline:
 *   Employee submits → Manager approves (hr.write) → Finance approves & pays (financial.write)
 */
export default function ExpensesPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView            = can("hr", "read");
  const canWrite           = can("hr", "write");
  const canApprove         = can("financial", "write");
  const canManagerApprove  = can("hr", "write");

  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 20;

  const [showNew, setShowNew]           = useState(false);
  const [rejectingId, setRejectingId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", category: "miscellaneous", amount: "",
    expenseDate: new Date().toISOString().slice(0, 10), projectCode: "", employeeId: "", receiptUrl: "",
  });

  const utils        = trpc.useUtils();
  const employeesQ   = trpc.hr.employees.list.useQuery({ limit: 200 }, mergeTrpcQueryOpts("hr.employees.list", { enabled: canView }));
  const expensesQ    = trpc.hr.expenses.list.useQuery(
    { status: (filterStatus || undefined) as any, limit: 200 },
    mergeTrpcQueryOpts("hr.expenses.list", { enabled: canView }),
  );

  const createMut = trpc.hr.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Expense claim created");
      setShowNew(false);
      setForm(f => ({ ...f, title: "", description: "", amount: "", projectCode: "", receiptUrl: "" }));
      void utils.hr.expenses.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const submitMut = trpc.hr.expenses.submit.useMutation({
    onSuccess: () => { toast.success("Submitted for manager approval"); void utils.hr.expenses.list.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const managerApproveMut = trpc.hr.expenses.managerApprove.useMutation({
    onSuccess: (_, vars) => {
      const v = vars as { id: string; approved: boolean; rejectionReason?: string };
      toast.success(v.approved ? "✅ Approved — forwarded to Finance" : "❌ Rejected");
      setRejectingId(null);
      setRejectReason("");
      void utils.hr.expenses.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!canView) return <AccessDenied module="Expense Management" />;

  const allItems  = (expensesQ.data ?? []) as any[];
  const filtered  = allItems.filter(r => {
    const c = r.claim ?? r;
    if (search && !c.title?.toLowerCase().includes(search.toLowerCase()) && !c.number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const pendingManager = allItems.filter(r => (r.claim ?? r).status === "submitted").length;
  const pendingFinance = allItems.filter(r => (r.claim ?? r).status === "under_review").length;
  const approvedAmt    = allItems.filter(r => (r.claim ?? r).status === "approved").reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);
  const reimbursedAmt  = allItems.filter(r => (r.claim ?? r).status === "reimbursed").reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">Expense Reimbursements</h1>
          <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">Submit · Manager Approves · Finance Pays</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && (
            <Link href="/app/finance/expenses" className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Finance approver queue">
              <CheckCircle2 className="w-3 h-3" /> Finance Queue
            </Link>
          )}
          <button onClick={() => void expensesQ.refetch()} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button onClick={() => downloadCSV(allItems.map(r => { const c = r.claim ?? r; return { Number: c.number, Title: c.title, Category: c.category, Amount: c.amount, Status: c.status }; }), "expenses")} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"><Download className="w-3 h-3" /> Export</button>
          <PermissionGate module="hr" action="write">
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> New Claim</button>
          </PermissionGate>
        </div>
      </div>

      {/* Approval pipeline banner */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/10 p-3">
        {[
          { step: "1", label: "Employee Submits",  sub: "Files claim",                     active: false },
          { step: "2", label: "Manager Approves",  sub: `${pendingManager} claim(s) waiting`, active: pendingManager > 0 && canManagerApprove },
          { step: "3", label: "Finance Pays",       sub: `${pendingFinance} claim(s) waiting`, active: pendingFinance > 0 && canApprove },
        ].map((s, i) => (
          <div key={i} className={`flex flex-col items-center rounded-lg border px-2 py-2 text-center transition-all ${s.active ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border bg-card"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 ${s.active ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{s.step}</div>
            <div className="text-[11px] font-semibold text-foreground">{s.label}</div>
            <div className={`text-[10px] mt-0.5 ${s.active ? "text-primary font-medium" : "text-muted-foreground"}`}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "Awaiting Manager", v: String(pendingManager), c: "text-blue-700",   I: Clock },
          { l: "Awaiting Finance",  v: String(pendingFinance), c: "text-yellow-700", I: UserCheck },
          { l: "Finance Approved",  v: fmtInr(approvedAmt),   c: "text-green-700",  I: CheckCircle2 },
          { l: "Reimbursed",        v: fmtInr(reimbursedAmt), c: "text-primary",    I: DollarSign },
        ].map(k => (
          <div key={k.l} className="bg-card border border-border rounded px-3 py-2">
            <k.I className="w-4 h-4 text-muted-foreground/70 mb-1" />
            <div className={`text-body-lg font-bold ${k.c}`}>{k.v}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search claims…" className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-border rounded bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground/70" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {expensesQ.isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="No expense claims" description="Submit your first expense claim to get started." action={canWrite ? <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> New Claim</button> : undefined} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>{["#", "Employee", "Title", "Category", "Amount", "Date", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map(row => {
                  const c = row.claim ?? row;
                  const cfg = (STATUS_CFG[c.status] ?? STATUS_CFG.draft) as { label: string; color: string; icon: ElementType };
                  const stage = STAGE_LABELS[c.status];
                  return (
                    <tr key={c.id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{c.number}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                        {row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[200px]">
                        <div className="">{c.title}</div>
                        {stage && (
                          <div className={`mt-0.5 text-[9px] px-1 py-0.5 rounded border inline-block whitespace-nowrap ${stage.color}`}>{stage.text}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground">{(c.category ?? "").replace(/_/g, " ")}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{fmtInr(Number(c.amount))}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{c.expenseDate ? new Date(c.expenseDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cfg.color}`}>
                          <cfg.icon className="w-3 h-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Step 0: draft → submit */}
                          {c.status === "draft" && canWrite && (
                            <button onClick={() => submitMut.mutate({ id: c.id })} disabled={submitMut.isPending} className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50">Submit</button>
                          )}
                          {/* Step 1: submitted → manager approve/reject */}
                          {c.status === "submitted" && canManagerApprove && (
                            <>
                              <button
                                onClick={() => managerApproveMut.mutate({ id: c.id, approved: true })}
                                disabled={managerApproveMut.isPending}
                                className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                              >
                                <ThumbsUp className="w-2.5 h-2.5" /> Approve
                              </button>
                              <button
                                onClick={() => { setRejectingId(c.id); setRejectReason(""); }}
                                className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                <ThumbsDown className="w-2.5 h-2.5" /> Reject
                              </button>
                            </>
                          )}
                          {c.status === "submitted" && !canManagerApprove && (
                            <span className="text-[10px] text-blue-600">Pending manager</span>
                          )}
                          {/* Step 2: under_review → finance queue */}
                          {c.status === "under_review" && !canApprove && (
                            <span className="text-[10px] text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200">⏳ Awaiting Finance</span>
                          )}
                          {c.status === "under_review" && canApprove && (
                            <Link href="/app/finance/expenses" className="text-[10px] text-yellow-700 underline">Go to Finance Queue →</Link>
                          )}
                          {c.status === "approved" && <span className="text-[10px] text-green-700">✓ Approved</span>}
                          {c.status === "reimbursed" && <span className="text-[10px] text-purple-700">✓ Paid</span>}
                          {c.status === "rejected" && (
                            <span className="text-[10px] text-red-600 max-w-[100px]" title={c.rejectionReason}>✗ {c.rejectionReason ?? "Rejected"}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}
        </>
      )}

      {/* Manager rejection reason modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-body-sm font-semibold mb-3 text-foreground">Reject Expense Claim</h3>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Reason for Rejection</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Please provide a reason…"
              className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none resize-none mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button
                disabled={managerApproveMut.isPending}
                onClick={() => managerApproveMut.mutate({ id: rejectingId, approved: false, rejectionReason: rejectReason || "Rejected by manager" })}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-[12px] rounded hover:bg-red-700 disabled:opacity-50"
              >
                {managerApproveMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New claim modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-body-sm font-semibold mb-1">New Expense Claim</h2>
            <p className="text-[11px] text-muted-foreground mb-4">After creating, click <strong>Submit</strong> to send for manager approval.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Client dinner at Taj" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Category</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Date</label><input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Employee *</label><select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none"><option value="">Select…</option>{((employeesQ.data as any[]) ?? []).map((e: any) => <option key={e.emp.id} value={e.emp.id}>{e.userName}</option>)}</select></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Project Code</label><input value={form.projectCode} onChange={e => setForm(f => ({ ...f, projectCode: e.target.value }))} placeholder="PROJ-001" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Details…" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none resize-none" /></div>
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Receipt URL</label><input type="url" value={form.receiptUrl} onChange={e => setForm(f => ({ ...f, receiptUrl: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button
                disabled={!form.title || !form.amount || !form.employeeId || createMut.isPending}
                onClick={() => createMut.mutate({
                  ...form,
                  amount: parseFloat(form.amount),
                  expenseDate: new Date(form.expenseDate),
                  projectCode: form.projectCode || undefined,
                  description: form.description || undefined,
                  receiptUrl: form.receiptUrl || undefined
                } as never)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Create Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
