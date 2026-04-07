"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import {
  Receipt, Plus, Search, Download, RefreshCw, CheckCircle2, XCircle, Clock,
  Loader2, FileText, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { EmptyState, Pagination, TableSkeleton, ConfirmDialog } from "@nexusops/ui";

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:        { label: "Draft",          color: "text-muted-foreground bg-muted",     icon: FileText },
  submitted:    { label: "Submitted",      color: "text-blue-700 bg-blue-100",           icon: Clock },
  under_review: { label: "Under Review",   color: "text-yellow-700 bg-yellow-100",       icon: Clock },
  approved:     { label: "Approved",       color: "text-green-700 bg-green-100",         icon: CheckCircle2 },
  rejected:     { label: "Rejected",       color: "text-red-700 bg-red-100",             icon: XCircle },
  reimbursed:   { label: "Reimbursed",     color: "text-purple-700 bg-purple-100",       icon: CheckCircle2 },
};

const CATEGORIES = [
  "travel", "accommodation", "food", "fuel", "communication",
  "office_supplies", "client_entertainment", "training", "medical", "miscellaneous",
];

function fmtInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function ExpensesPage() {
  const { can } = useRBAC();
  const canView  = can("hr", "read");
  const canWrite = can("hr", "write");

  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 20;

  const [showNew, setShowNew]           = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; approved: boolean } | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "miscellaneous", amount: "",
    expenseDate: new Date().toISOString().slice(0, 10), projectCode: "", employeeId: "",
  });

  const utils        = trpc.useUtils();
  const employeesQ   = trpc.hr.listEmployees.useQuery({ limit: 200 }, { enabled: canView });
  const expensesQ    = trpc.hr.expenses.list.useQuery({ status: filterStatus || undefined, limit: 200 }, { enabled: canView });

  const createMut  = trpc.hr.expenses.create.useMutation({
    onSuccess: () => { toast.success("Expense claim created"); setShowNew(false); setForm(f => ({ ...f, title: "", description: "", amount: "", projectCode: "" })); void utils.hr.expenses.list.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const submitMut  = trpc.hr.expenses.submit.useMutation({ onSuccess: () => { toast.success("Submitted for approval"); void utils.hr.expenses.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const approveMut = trpc.hr.expenses.approve.useMutation({ onSuccess: (d) => { toast.success((d as any).status === "approved" ? "Approved" : "Rejected"); setConfirmAction(null); void utils.hr.expenses.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const reimbMut   = trpc.hr.expenses.markReimbursed.useMutation({ onSuccess: () => { toast.success("Marked as reimbursed"); void utils.hr.expenses.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  if (!canView) return <AccessDenied module="Expense Management" />;

  const allItems  = (expensesQ.data ?? []) as any[];
  const filtered  = allItems.filter(r => {
    const c = r.claim ?? r;
    if (search && !c.title?.toLowerCase().includes(search.toLowerCase()) && !c.number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const pending    = allItems.filter(r => ["submitted", "under_review"].includes((r.claim ?? r).status)).reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);
  const approved   = allItems.filter(r => (r.claim ?? r).status === "approved").reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);
  const reimbursed = allItems.filter(r => (r.claim ?? r).status === "reimbursed").reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Expense Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Claims · Approvals · Reimbursements</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void expensesQ.refetch()} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Refresh"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button onClick={() => downloadCSV(allItems.map(r => { const c = r.claim ?? r; return { Number: c.number, Title: c.title, Category: c.category, Amount: c.amount, Status: c.status }; }), "expenses")} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Export"><Download className="w-3 h-3" /> Export</button>
          <PermissionGate module="hr" action="write">
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> New Claim</button>
          </PermissionGate>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2">
        {[{ l: "Pending Approval", v: fmtInr(pending), c: "text-yellow-700", I: Clock }, { l: "Approved (Unpaid)", v: fmtInr(approved), c: "text-green-700", I: CheckCircle2 }, { l: "Reimbursed", v: fmtInr(reimbursed), c: "text-primary", I: DollarSign }].map(k => (
          <div key={k.l} className="bg-card border border-border rounded px-3 py-2">
            <k.I className="w-4 h-4 text-muted-foreground/70 mb-1" />
            <div className={`text-lg font-bold ${k.c}`}>{k.v}</div>
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

      {expensesQ.isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="No expense claims" description="Submit your first expense claim to get started." action={canWrite ? <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> New Claim</button> : undefined} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>{["Number", "Title", "Category", "Amount", "Date", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map(row => {
                  const c = row.claim ?? row;
                  const cfg = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
                  return (
                    <tr key={c.id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{c.number}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[180px] truncate">{c.title}</td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground">{(c.category ?? "").replace(/_/g, " ")}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{fmtInr(Number(c.amount))}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.expenseDate ? new Date(c.expenseDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.color}`}><cfg.icon className="w-3 h-3" />{cfg.label}</span></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {c.status === "draft" && canWrite && <button onClick={() => submitMut.mutate({ id: c.id })} className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit</button>}
                          {["submitted", "under_review"].includes(c.status) && canWrite && <>
                            <button onClick={() => setConfirmAction({ id: c.id, approved: true })} className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200">Approve</button>
                            <button onClick={() => setConfirmAction({ id: c.id, approved: false })} className="px-2 py-0.5 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200">Reject</button>
                          </>}
                          {c.status === "approved" && canWrite && <button onClick={() => reimbMut.mutate({ id: c.id })} className="px-2 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded hover:bg-purple-200">Reimburse</button>}
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

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-sm font-semibold mb-4">New Expense Claim</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Client dinner at Taj" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Category</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Date</label><input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Employee *</label><select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none"><option value="">Select…</option>{((employeesQ.data as any)?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Project Code</label><input value={form.projectCode} onChange={e => setForm(f => ({ ...f, projectCode: e.target.value }))} placeholder="PROJ-001" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Details…" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none resize-none" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={!form.title || !form.amount || !form.employeeId || createMut.isPending} onClick={() => createMut.mutate({ ...form, amount: parseFloat(form.amount), expenseDate: new Date(form.expenseDate) })} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-50">
                {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Create Claim
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.approved ? "Approve expense?" : "Reject expense?"} description={confirmAction?.approved ? "The employee will be notified." : "The claim will be rejected."} confirmLabel={confirmAction?.approved ? "Approve" : "Reject"} variant={confirmAction?.approved ? "default" : "destructive"} loading={approveMut.isPending} onConfirm={() => confirmAction && approveMut.mutate({ id: confirmAction.id, approved: confirmAction.approved })} />
    </div>
  );
}
