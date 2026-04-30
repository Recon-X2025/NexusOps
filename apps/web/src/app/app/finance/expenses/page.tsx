"use client";

export const dynamic = "force-dynamic";

/**
 * Finance approver / reimbursement queue for employee expense claims.
 *
 * Distinct from `/app/hr/expenses`, which is the **submitter** half (file a
 * claim, edit drafts, submit). This page is the **approver** half — list
 * pending claims, approve / reject, and mark as reimbursed once paid.
 *
 * Gated on `financial.read` for view; the approve / reimburse mutations
 * themselves require `financial.write` (enforced server-side in
 * `apps/api/src/routers/hr.ts → expenses.approve / markReimbursed`).
 */

import { useMemo, useState, type ElementType } from "react";
import {
  Receipt, Search, Download, RefreshCw, CheckCircle2, XCircle, Clock,
  FileText, DollarSign, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { EmptyState, Pagination, TableSkeleton, ConfirmDialog } from "@coheronconnect/ui";

const STATUS_CFG: Record<string, { label: string; color: string; icon: ElementType }> = {
  draft:        { label: "Draft",        color: "text-muted-foreground bg-muted",     icon: FileText },
  submitted:    { label: "Submitted",    color: "text-blue-700 bg-blue-100",          icon: Clock },
  under_review: { label: "Under Review", color: "text-yellow-700 bg-yellow-100",      icon: Clock },
  approved:     { label: "Approved",     color: "text-green-700 bg-green-100",        icon: CheckCircle2 },
  rejected:     { label: "Rejected",     color: "text-red-700 bg-red-100",            icon: XCircle },
  reimbursed:   { label: "Reimbursed",   color: "text-purple-700 bg-purple-100",      icon: CheckCircle2 },
};

const QUEUE_TABS = [
  { key: "pending",    label: "Pending Approval", statuses: ["submitted", "under_review"] },
  { key: "approved",   label: "Approved (Unpaid)", statuses: ["approved"] },
  { key: "reimbursed", label: "Reimbursed",       statuses: ["reimbursed"] },
  { key: "rejected",   label: "Rejected",         statuses: ["rejected"] },
] as const;

function fmtInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function FinanceExpensesQueuePage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView   = can("financial", "read") || can("hr", "read");
  const canDecide = can("financial", "write");

  const [tab, setTab]                     = useState<(typeof QUEUE_TABS)[number]["key"]>("pending");
  const [search, setSearch]               = useState("");
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 25;

  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    kind: "approve" | "reject" | "reimburse";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const utils     = trpc.useUtils();
  const expensesQ = trpc.hr.expenses.list.useQuery(
    { limit: 200 },
    mergeTrpcQueryOpts("hr.expenses.list", { enabled: canView }),
  );

  const approveMut = trpc.hr.expenses.approve.useMutation({
    onSuccess: (d) => {
      toast.success((d as any).status === "approved" ? "Approved" : "Rejected");
      setConfirmAction(null);
      setRejectReason("");
      void utils.hr.expenses.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const reimbMut = trpc.hr.expenses.markReimbursed.useMutation({
    onSuccess: () => {
      toast.success("Marked as reimbursed");
      setConfirmAction(null);
      void utils.hr.expenses.list.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!canView) return <AccessDenied module="Expenses & Reimbursements" />;

  const allItems = (expensesQ.data ?? []) as any[];

  const tabCfg = QUEUE_TABS.find((t) => t.key === tab) ?? QUEUE_TABS[0];

  const filtered = useMemo(
    () =>
      allItems.filter((r) => {
        const c = r.claim ?? r;
        if (!(tabCfg.statuses as readonly string[]).includes(c.status)) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!c.title?.toLowerCase().includes(s) && !c.number?.toLowerCase().includes(s))
            return false;
        }
        return true;
      }),
    [allItems, tabCfg, search],
  );
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const sumOf = (statuses: string[]) =>
    allItems
      .filter((r) => statuses.includes((r.claim ?? r).status))
      .reduce((s, r) => s + Number((r.claim ?? r).amount ?? 0), 0);

  const pendingTotal    = sumOf(["submitted", "under_review"]);
  const approvedTotal   = sumOf(["approved"]);
  const reimbursedTotal = sumOf(["reimbursed"]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Expenses &amp; Reimbursements</h1>
          <span className="text-[11px] text-muted-foreground/70">
            Finance approver queue · Approve · Reimburse
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/hr/expenses"
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            aria-label="Back to my claims"
          >
            <ArrowLeft className="w-3 h-3" /> My claims
          </Link>
          <button
            onClick={() => void expensesQ.refetch()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button
            onClick={() =>
              downloadCSV(
                filtered.map((r) => {
                  const c = r.claim ?? r;
                  return {
                    Number: c.number,
                    Title: c.title,
                    Category: c.category,
                    Amount: c.amount,
                    Status: c.status,
                  };
                }),
                `expenses-${tab}`,
              )
            }
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            aria-label="Export"
          >
            <Download className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Pending Approval", v: fmtInr(pendingTotal), c: "text-yellow-700", I: Clock },
          { l: "Approved (Unpaid)", v: fmtInr(approvedTotal), c: "text-green-700", I: CheckCircle2 },
          { l: "Reimbursed", v: fmtInr(reimbursedTotal), c: "text-primary", I: DollarSign },
        ].map((k) => (
          <div key={k.l} className="bg-card border border-border rounded px-3 py-2">
            <k.I className="w-4 h-4 text-muted-foreground/70 mb-1" />
            <div className={`text-lg font-bold ${k.c}`}>{k.v}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-b border-border">
        {QUEUE_TABS.map((t) => {
          const count = allItems.filter((r) =>
            (t.statuses as readonly string[]).includes((r.claim ?? r).status),
          ).length;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${
                active
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-muted-foreground/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claims…"
            className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-border rounded bg-background outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {expensesQ.isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={`No ${tabCfg.label.toLowerCase()}`}
          description="Nothing to review right now."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Number", "Title", "Category", "Amount", "Date", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((row) => {
                  const c = row.claim ?? row;
                  const cfg = (STATUS_CFG[c.status] ?? STATUS_CFG.draft) as {
                    label: string;
                    color: string;
                    icon: ElementType;
                  };
                  return (
                    <tr key={c.id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{c.number}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-[220px] truncate">{c.title}</td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground">
                        {(c.category ?? "").replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">
                        {fmtInr(Number(c.amount))}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {c.expenseDate ? new Date(c.expenseDate).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.color}`}
                        >
                          <cfg.icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {["submitted", "under_review"].includes(c.status) && canDecide && (
                            <>
                              <button
                                onClick={() => setConfirmAction({ id: c.id, kind: "approve" })}
                                className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setConfirmAction({ id: c.id, kind: "reject" })}
                                className="px-2 py-0.5 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {c.status === "approved" && canDecide && (
                            <button
                              onClick={() => setConfirmAction({ id: c.id, kind: "reimburse" })}
                              className="px-2 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                            >
                              Reimburse
                            </button>
                          )}
                          {!canDecide && (
                            <span className="text-[10px] text-muted-foreground/60">Read-only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setRejectReason("");
          }
        }}
        title={
          confirmAction?.kind === "approve"
            ? "Approve expense?"
            : confirmAction?.kind === "reject"
              ? "Reject expense?"
              : "Mark as reimbursed?"
        }
        description={
          confirmAction?.kind === "approve"
            ? "Approves the claim and notifies the employee. Funds are released only after reimbursement is marked."
            : confirmAction?.kind === "reject"
              ? "Rejects the claim. The employee will be notified with your reason."
              : "Confirms that funds have been transferred. This is the final state."
        }
        confirmLabel={
          confirmAction?.kind === "approve"
            ? "Approve"
            : confirmAction?.kind === "reject"
              ? "Reject"
              : "Mark reimbursed"
        }
        variant={confirmAction?.kind === "reject" ? "destructive" : "default"}
        loading={approveMut.isPending || reimbMut.isPending}
        disableConfirm={confirmAction?.kind === "reject" && rejectReason.trim().length < 4}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "reimburse") {
            reimbMut.mutate({ id: confirmAction.id });
          } else {
            approveMut.mutate({
              id: confirmAction.id,
              approved: confirmAction.kind === "approve",
              rejectionReason:
                confirmAction.kind === "reject" ? rejectReason.trim() : undefined,
            });
          }
        }}
      >
        {confirmAction?.kind === "reject" && (
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Missing tax invoice, exceeds policy cap, duplicate of EXP-2026-0123"
              className="w-full px-2 py-1.5 text-[12px] border border-border rounded outline-none resize-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Minimum 4 characters. Shown to the employee.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
