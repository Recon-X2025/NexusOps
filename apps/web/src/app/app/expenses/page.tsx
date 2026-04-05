"use client";

import { useState } from "react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  ChevronRight,
  IndianRupee,
  AlertCircle,
  Send,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  draft:        { label: "Draft",         icon: FileText,     color: "text-muted-foreground bg-muted" },
  submitted:    { label: "Submitted",     icon: Send,         color: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40" },
  under_review: { label: "Under Review",  icon: Clock,        color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40" },
  approved:     { label: "Approved",      icon: CheckCircle2, color: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40" },
  rejected:     { label: "Rejected",      icon: XCircle,      color: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40" },
  paid:         { label: "Paid",          icon: CheckCircle2, color: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40" },
  cancelled:    { label: "Cancelled",     icon: XCircle,      color: "text-muted-foreground bg-muted" },
};

const CATEGORY_LABEL: Record<string, string> = {
  travel: "Travel", accommodation: "Accommodation", meals: "Meals",
  transport: "Transport", office_supplies: "Office Supplies", software: "Software",
  marketing: "Marketing", training: "Training", entertainment: "Entertainment",
  medical: "Medical", other: "Other",
};

function fmt(amount: string | number | null | undefined, currency = "INR") {
  if (!amount) return "₹0";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function ExpensesPage() {
  const { can, canAccess } = useRBAC();

  if (!canAccess("financial")) return <AccessDenied />;

  return <ExpensesContent />;
}

function ExpensesContent() {
  const { currentUser } = useRBAC();
  const [tab, setTab] = useState<"my" | "all" | "pending">("my");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const myReports = trpc.expenses.myReports.useQuery({ limit: 100 });
  const allReports = trpc.expenses.listReports.useQuery(
    { limit: 200 },
    { enabled: tab === "all" },
  );
  const pendingReports = trpc.expenses.listReports.useQuery(
    { status: "submitted", limit: 200 },
    { enabled: tab === "pending" },
  );
  const summary = trpc.expenses.summary.useQuery();

  const submitReport = trpc.expenses.submitReport.useMutation({
    onSuccess: () => { toast.success("Report submitted for approval"); myReports.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reviewReport = trpc.expenses.reviewReport.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Report ${vars.decision}`);
      allReports.refetch();
      pendingReports.refetch();
      myReports.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rawData = tab === "my" ? (myReports.data ?? []) : tab === "pending" ? (pendingReports.data ?? []) : (allReports.data ?? []);
  const isLoading = tab === "my" ? myReports.isLoading : tab === "pending" ? pendingReports.isLoading : allReports.isLoading;

  const filtered = rawData.filter((r: any) =>
    !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.number?.toLowerCase().includes(search.toLowerCase()),
  );

  const summaryByStatus = Object.fromEntries((summary.data ?? []).map((s: any) => [s.status, { count: s.count, total: s.total }]));
  const totalPending = parseFloat(summaryByStatus["submitted"]?.total ?? "0") + parseFloat(summaryByStatus["under_review"]?.total ?? "0");
  const totalApproved = parseFloat(summaryByStatus["approved"]?.total ?? "0");
  const totalPaid = parseFloat(summaryByStatus["paid"]?.total ?? "0");

  return (
    <div className="flex flex-col h-full min-h-0 gap-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Expense Management</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{rawData.length}</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-3 w-3" />
          New Report
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Pending Approval</p>
          <p className="text-xl font-bold text-amber-600 mt-0.5">{fmt(totalPending)}</p>
          <p className="text-xs text-muted-foreground">{(summaryByStatus["submitted"]?.count ?? 0) + (summaryByStatus["under_review"]?.count ?? 0)} reports</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Approved (Unpaid)</p>
          <p className="text-xl font-bold text-green-600 mt-0.5">{fmt(totalApproved)}</p>
          <p className="text-xs text-muted-foreground">{summaryByStatus["approved"]?.count ?? 0} reports</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Paid This Cycle</p>
          <p className="text-xl font-bold text-violet-600 mt-0.5">{fmt(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">{summaryByStatus["paid"]?.count ?? 0} reports</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Drafts</p>
          <p className="text-xl font-bold text-muted-foreground mt-0.5">{summaryByStatus["draft"]?.count ?? 0}</p>
          <p className="text-xs text-muted-foreground">awaiting submission</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-3">
        <div className="flex items-center gap-1">
          {(["my", "pending", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "my" ? "My Reports" : t === "pending" ? "Pending Approval" : "All Reports"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:border-primary w-48"
            />
          </div>
          <button
            onClick={() => { myReports.refetch(); allReports.refetch(); pendingReports.refetch(); }}
            className="p-1.5 rounded border border-border hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expense reports"
            description={
              tab === "my"
                ? "You haven't submitted any expense reports yet. Click 'New Report' to get started."
                : tab === "pending"
                ? "No reports are pending your approval."
                : "No expense reports found."
            }
            action={tab === "my" ? { label: "New Report", onClick: () => setShowCreate(true) } : undefined}
          />
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Purpose</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submitted</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((report: any) => {
                const cfg = STATUS_CFG[report.status] ?? STATUS_CFG.draft!;
                const Icon = cfg.icon;
                return (
                  <tr key={report.id} className="border-b border-border/60 hover:bg-accent/40 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-primary">{report.number}</span>
                        <span className="font-medium text-foreground/90">{report.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                      {report.businessPurpose ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {fmt(report.totalAmount, report.currency)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString("en-IN") : report.status === "draft" ? "Not yet" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {report.status === "draft" && (
                          <button
                            onClick={() => submitReport.mutate({ id: report.id })}
                            disabled={submitReport.isPending}
                            className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                            title="Submit for approval"
                          >
                            Submit
                          </button>
                        )}
                        {tab === "pending" && report.status === "submitted" && (
                          <>
                            <button
                              onClick={() => reviewReport.mutate({ id: report.id, decision: "approved" })}
                              disabled={reviewReport.isPending}
                              className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-300"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = window.prompt("Rejection reason:");
                                if (reason !== null) reviewReport.mutate({ id: report.id, decision: "rejected", rejectionReason: reason });
                              }}
                              disabled={reviewReport.isPending}
                              className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-300"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateReportDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); myReports.refetch(); setTab("my"); }}
        />
      )}
    </div>
  );
}

function CreateReportDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");

  const create = trpc.expenses.createReport.useMutation({
    onSuccess: () => { toast.success("Expense report created"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-sm font-semibold mb-4">New Expense Report</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Report Title *</label>
            <input
              type="text"
              placeholder="e.g. Q2 Travel — Mumbai Sales Summit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Business Purpose</label>
            <textarea
              rows={2}
              placeholder="Describe the business reason for this expense report…"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-muted">Cancel</button>
          <button
            onClick={() => {
              if (!title.trim()) { toast.error("Title is required"); return; }
              create.mutate({ title: title.trim(), businessPurpose: purpose.trim() || undefined });
            }}
            disabled={create.isPending}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Create Report
          </button>
        </div>
      </div>
    </div>
  );
}
