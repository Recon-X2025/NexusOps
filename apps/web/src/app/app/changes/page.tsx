"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  RefreshCw,
  Plus,
  AlertTriangle,
  Clock,
  Calendar,
  ChevronRight,
  Flame,
  Loader2,
} from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  high:     "text-red-700 bg-red-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
  critical: "text-red-800 bg-red-200 font-bold",
};

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  draft:          { label: "Draft",        color: "text-muted-foreground bg-muted" },
  submitted:      { label: "Submitted",    color: "text-blue-700 bg-blue-100" },
  cab_approval:   { label: "CAB Review",   color: "text-yellow-700 bg-yellow-100" },
  approved:       { label: "Approved",     color: "text-green-700 bg-green-100" },
  scheduled:      { label: "Scheduled",    color: "text-indigo-700 bg-indigo-100" },
  implementation: { label: "In Progress",  color: "text-orange-700 bg-orange-100" },
  complete:       { label: "Complete",     color: "text-green-700 bg-green-100" },
  failed:         { label: "Failed",       color: "text-red-700 bg-red-100" },
  cancelled:      { label: "Cancelled",    color: "text-muted-foreground bg-muted" },
};

const TABS = [
  { key: "all",            label: "All Changes", status: undefined,          module: "changes" as const, action: "read"    as const },
  { key: "cab_approval",   label: "CAB Review",  status: "cab_approval",     module: "changes" as const, action: "approve" as const },
  { key: "approved",       label: "Approved",    status: "approved",         module: "changes" as const, action: "read"    as const },
  { key: "scheduled",      label: "Scheduled",   status: "scheduled",        module: "changes" as const, action: "read"    as const },
  { key: "implementation", label: "In Progress", status: "implementation",   module: "changes" as const, action: "write"   as const },
  { key: "complete",       label: "Complete",    status: "complete",         module: "changes" as const, action: "read"    as const },
];

export default function ChangesPage() {
  const { can } = useRBAC();
  const hasAccess = can("changes", "read");

  const visibleTabs = useMemo(() => TABS.filter((t) => can(t.module, t.action)), [can]);
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? "all");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) setActiveTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, activeTab]);

  // All hooks must be called unconditionally — the early access-denied return
  // happens AFTER this block to avoid React error #310 (conditional hook count).
  const activeStatus = TABS.find((t) => t.key === activeTab)?.status;

  const { data, isLoading, refetch } = trpc.changes.list.useQuery(
    { status: activeStatus, limit: 50 },
    { refetchOnWindowFocus: false, enabled: hasAccess },
  );
  const { data: counts } = trpc.changes.statusCounts.useQuery(
    undefined,
    { refetchOnWindowFocus: false, enabled: hasAccess },
  );

  const [actionRow, setActionRow] = useState<string | null>(null);
  const [cabComment, setCabComment] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const approveCR = trpc.changes.approve.useMutation({
    onSuccess: () => {
      setActionMsg("Change approved"); setActionRow(null); setCabComment(""); refetch();
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const rejectCR = trpc.changes.reject.useMutation({
    onSuccess: () => {
      setActionMsg("Change rejected"); setActionRow(null); setCabComment(""); refetch();
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // Deferred access guard — all hooks already called above
  if (!hasAccess) return <AccessDenied module="Change Management" />;

  type ChangeItem = NonNullable<typeof data>["items"][number];
  const items: ChangeItem[] = data?.items ?? [];
  const cabPending = (counts as Record<string, number> | undefined)?.["cab_approval"] ?? 0;
  const emergencyCount = items.filter((c) => c.type === "emergency").length;
  const scheduledThisWeek =
    ((counts as Record<string, number> | undefined)?.["approved"] ?? 0) +
    ((counts as Record<string, number> | undefined)?.["scheduled"] ?? 0) +
    ((counts as Record<string, number> | undefined)?.["implementation"] ?? 0);
  const totalOpen = Object.entries((counts as Record<string, number>) ?? {})
    .filter(([k]) => !["complete", "failed", "cancelled"].includes(k))
    .reduce((s, [, v]) => s + v, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Change Management</h1>
          <span className="text-[11px] text-muted-foreground">CAB Review & Change Calendar</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-accent"
          >
            <Calendar className="w-3 h-3" /> Change Calendar
          </button>
          <Link
            href="/app/changes/new"
            className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-medium rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Change Request
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Awaiting CAB",      value: cabPending,        color: "text-yellow-700", border: "border-yellow-200" },
          { label: "Emergency Changes", value: emergencyCount,    color: "text-red-700",    border: "border-red-200" },
          { label: "Active This Week",  value: scheduledThisWeek, color: "text-blue-700",   border: "border-border" },
          { label: "Total Open",        value: totalOpen,         color: "text-foreground", border: "border-border" },
        ].map((k) => (
          <div key={k.label} className={`bg-card border rounded px-3 py-2 ${k.border}`}>
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* CAB alert */}
      {cabPending > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-[12px]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{cabPending} change{cabPending > 1 ? "s" : ""}</strong> awaiting CAB review and approval before scheduled implementation window.
          <Link href="/app/changes?tab=cab_approval" className="ml-auto text-yellow-700 hover:underline font-medium whitespace-nowrap">
            Review Now <ChevronRight className="w-3 h-3 inline" />
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border bg-card rounded-t">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            {tab.label}
            {tab.key === "cab_approval" && cabPending > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold">
                {cabPending}
              </span>
            )}
          </button>
        ))}
        {actionMsg && <span className="ml-auto mr-3 text-[11px] text-green-700 font-medium">{actionMsg}</span>}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-b overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading changes…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
            <RefreshCw className="w-5 h-5 opacity-30" />
            <span className="text-xs">No change requests found.</span>
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Change #</th>
                <th>Title</th>
                <th>Type</th>
                <th>Risk</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((chg) => {
                const stateCfg = STATE_CONFIG[chg.status];
                const isCab = chg.status === "cab_review" || chg.status === "cab_approval";
                const isExpanded = actionRow === chg.id;
                return (
                  <React.Fragment key={chg.id}>
                  <tr key={chg.id}>
                    <td className="p-0 w-1 relative">
                      <div
                        className={`priority-bar ${
                          chg.risk === "critical" ? "bg-red-600"
                            : chg.risk === "high" ? "bg-orange-500"
                            : chg.risk === "medium" ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                      />
                    </td>
                    <td>
                      <Link
                        href={`/app/changes/${chg.id}`}
                        className="text-primary hover:underline font-medium font-mono"
                      >
                        {chg.number}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <Link href={`/app/changes/${chg.id}`} className="text-foreground hover:underline truncate block">
                        {chg.type === "emergency" && (
                          <Flame className="w-3 h-3 text-red-500 inline mr-1" />
                        )}
                        {chg.title}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          chg.type === "emergency"
                            ? "text-red-700 bg-red-100 font-semibold"
                            : chg.type === "normal"
                              ? "text-blue-700 bg-blue-100"
                              : "text-muted-foreground bg-muted"
                        }`}
                      >
                        {(chg.type ?? "standard").charAt(0).toUpperCase() + (chg.type ?? "standard").slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${RISK_COLORS[chg.risk] ?? "text-muted-foreground bg-muted"}`}>
                        {(chg.risk ?? "low").charAt(0).toUpperCase() + (chg.risk ?? "low").slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`flex items-center gap-1 text-[11px] ${chg.type === "emergency" ? "text-red-700 font-semibold" : "text-muted-foreground"}`}>
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        {chg.scheduledStart ? formatDate(chg.scheduledStart) : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${stateCfg?.color ?? "text-muted-foreground bg-muted"}`}>
                        {stateCfg?.label ?? chg.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {isCab && can("changes", "approve") ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setActionRow(isExpanded ? null : chg.id)}
                            className="px-2 py-0.5 rounded text-[11px] bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                          >
                            {isExpanded ? "Cancel" : "Decide"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-yellow-50/60 border-t border-yellow-200">
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground font-medium">CAB Note (optional):</span>
                          <input
                            className="flex-1 max-w-xs text-xs border border-border rounded px-2 py-1 bg-background"
                            placeholder="Add comment for this CAB decision…"
                            value={cabComment}
                            onChange={(e) => setCabComment(e.target.value)}
                          />
                          <button
                            disabled={approveCR.isPending}
                            onClick={() => approveCR.mutate({ changeId: chg.id, comments: cabComment || undefined })}
                            className="px-3 py-1 rounded bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            {approveCR.isPending ? "…" : "✓ Approve"}
                          </button>
                          <button
                            disabled={rejectCR.isPending}
                            onClick={() => rejectCR.mutate({ changeId: chg.id, comments: cabComment || "Rejected by CAB" })}
                            className="px-3 py-1 rounded bg-red-600 text-white text-[11px] font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {rejectCR.isPending ? "…" : "✕ Reject"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          {items.length} record{items.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Risk Assessment Panel */}
      <div className="bg-card border border-border rounded">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Risk Assessment Summary
          </span>
        </div>
        <div className="p-4 grid grid-cols-4 gap-3">
          {[
            { label: "Critical Risk", key: "critical", color: "text-red-700 bg-red-50 border-red-200" },
            { label: "High Risk",     key: "high",     color: "text-orange-700 bg-orange-50 border-orange-200" },
            { label: "Medium Risk",   key: "medium",   color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
            { label: "Low Risk",      key: "low",      color: "text-green-700 bg-green-50 border-green-200" },
          ].map((r) => {
            const cnt = items.filter((c) => c.risk === r.key).length;
            return (
              <div key={r.label} className={`flex flex-col items-center justify-center py-3 rounded border ${r.color}`}>
                <span className={`text-2xl font-bold ${r.color.split(" ")[0]}`}>{cnt}</span>
                <span className="text-[10px] uppercase tracking-wide mt-0.5 text-muted-foreground">{r.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
