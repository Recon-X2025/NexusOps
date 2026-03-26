"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import {
  Bug,
  Plus,
  AlertTriangle,
  RefreshCw,
  FileText,
  Link2,
  ChevronRight,
  BookOpen,
  Loader2,
} from "lucide-react";

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  new:                 { label: "New",          color: "text-muted-foreground bg-muted" },
  in_progress:         { label: "In Progress",  color: "text-blue-700 bg-blue-100" },
  root_cause_analysis: { label: "RCA",          color: "text-orange-700 bg-orange-100" },
  known_error:         { label: "Known Error",  color: "text-red-700 bg-red-100" },
  change_raised:       { label: "Change Raised",color: "text-indigo-700 bg-indigo-100" },
  resolved:            { label: "Resolved",     color: "text-green-700 bg-green-100" },
  closed:              { label: "Closed",       color: "text-muted-foreground bg-muted" },
};

const PRIORITY_CONFIG: Record<string, { label: string; bar: string }> = {
  "1_critical": { label: "1 – Critical", bar: "bg-red-600" },
  "2_high":     { label: "2 – High",     bar: "bg-orange-500" },
  "3_moderate": { label: "3 – Moderate", bar: "bg-yellow-500" },
  "4_low":      { label: "4 – Low",      bar: "bg-green-500" },
  critical:     { label: "Critical",     bar: "bg-red-600" },
  high:         { label: "High",         bar: "bg-orange-500" },
  medium:       { label: "Medium",       bar: "bg-yellow-500" },
  low:          { label: "Low",          bar: "bg-green-500" },
};

const TABS = [
  { key: "all",                 label: "All Problems", status: undefined,              module: "problems" as const, action: "read"  as const },
  { key: "root_cause_analysis", label: "RCA",          status: "root_cause_analysis",  module: "problems" as const, action: "write" as const },
  { key: "known_error",         label: "Known Errors", status: "known_error",          module: "problems" as const, action: "write" as const },
  { key: "in_progress",         label: "In Progress",  status: "in_progress",          module: "problems" as const, action: "read"  as const },
  { key: "resolved",            label: "Resolved",     status: "resolved",             module: "problems" as const, action: "read"  as const },
];

export default function ProblemsPage() {
  const { can } = useRBAC();
  const visibleTabs = TABS.filter((t) => can(t.module, t.action));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? "all");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) setActiveTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, activeTab]);

  if (!can("problems", "read")) return <AccessDenied module="Problem Management" />;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeStatus = TABS.find((t) => t.key === activeTab)?.status;

  const { data: allData, isLoading } = trpc.changes.listProblems.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );

  type ProblemItem = NonNullable<typeof allData>[number];
  const allProblems: ProblemItem[] = allData ?? [];

  const displayed = activeStatus
    ? allProblems.filter((p) => p.status === activeStatus)
    : allProblems;

  const knownErrors = allProblems.filter((p) => p.status === "known_error");
  const openProblems = allProblems.filter((p) => !["resolved", "closed"].includes(p.status));
  const resolvedCount = allProblems.filter((p) => p.status === "resolved").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Problem Management</h1>
          <span className="text-[11px] text-muted-foreground">Root Cause Analysis & Known Errors</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-accent">
            <BookOpen className="w-3 h-3" /> Known Errors DB
          </button>
          <button className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-medium rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> New Problem
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Open Problems",  value: openProblems.length, color: "text-blue-700" },
          { label: "Known Errors",   value: knownErrors.length,  color: "text-red-700" },
          { label: "Under RCA",      value: allProblems.filter((p) => p.status === "root_cause_analysis").length, color: "text-orange-700" },
          { label: "Resolved (all)", value: resolvedCount,       color: "text-green-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Known error alert banner */}
      {knownErrors.length > 0 && (
        <div className="bg-card border border-border rounded divide-y divide-border">
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-l-4 border-l-red-500">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-[12px] font-semibold text-red-700">
              {knownErrors.length} Active Known Error{knownErrors.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[12px] text-red-600">
              — Workarounds available. Click to view details.
            </span>
          </div>
          {knownErrors.map((ke) => (
            <div key={ke.id} className="px-4 py-2.5 flex items-start justify-between gap-4 hover:bg-accent/40">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-primary">{ke.number}</span>
                  <span className="status-badge text-red-700 bg-red-100">Known Error</span>
                </div>
                <p className="text-[12px] text-foreground mt-0.5">{ke.title}</p>
                {ke.workaround && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground/70">Workaround: </span>
                    {ke.workaround}
                  </p>
                )}
                {ke.resolution && (
                  <p className="text-[11px] text-green-700 mt-0.5">
                    <span className="font-medium">Fix: </span>{ke.resolution}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="text-[11px] text-primary hover:underline">Publish to KB</button>
                <Link href={`/app/problems/${ke.id}`} className="text-[11px] text-primary hover:underline">
                  View <ChevronRight className="w-3 h-3 inline" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border bg-card rounded-t">
        {visibleTabs.map((tab) => {
          const cnt = tab.status
            ? allProblems.filter((p) => p.status === tab.status).length
            : undefined;
          return (
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
              {tab.key === "known_error" && knownErrors.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                  {knownErrors.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-b overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading problems…</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
            <Bug className="w-5 h-5 opacity-30" />
            <span className="text-xs">No problems found.</span>
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Problem #</th>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Workaround</th>
                <th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((prob) => {
                const pCfg = PRIORITY_CONFIG[prob.priority ?? ""] ?? { label: prob.priority ?? "—", bar: "bg-slate-400" };
                const sCfg = STATE_CONFIG[prob.status];
                const isKnownError = prob.status === "known_error";
                return (
                  <>
                    <tr
                      key={prob.id}
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === prob.id ? null : prob.id)}
                    >
                      <td className="p-0 w-1 relative">
                        <div className={`priority-bar ${pCfg.bar}`} />
                      </td>
                      <td>
                        <Link
                          href={`/app/problems/${prob.id}`}
                          className="text-primary hover:underline font-medium font-mono"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {prob.number}
                        </Link>
                      </td>
                      <td className="max-w-xs">
                        <div className="flex items-center gap-1">
                          {isKnownError && (
                            <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" aria-hidden />
                          )}
                          <span className="truncate text-foreground">{prob.title}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{pCfg.label}</td>
                      <td>
                        <span className={`status-badge ${sCfg?.color ?? "text-muted-foreground bg-muted"}`}>
                          {sCfg?.label ?? prob.status}
                        </span>
                      </td>
                      <td className="max-w-[200px]">
                        {prob.workaround ? (
                          <span className="truncate block text-[11px] text-muted-foreground">{prob.workaround}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground text-[11px]">
                        {prob.assigneeId ? prob.assigneeId.slice(0, 8) + "…" : "—"}
                      </td>
                    </tr>
                    {expandedId === prob.id && (
                      <tr key={`${prob.id}-expanded`} className="bg-muted/20">
                        <td />
                        <td colSpan={6} className="py-3 px-4">
                          <div className="grid grid-cols-2 gap-4 text-[12px]">
                            <div>
                              <p className="field-label">Workaround</p>
                              <p className="text-foreground">{prob.workaround ?? "None documented."}</p>
                            </div>
                            <div>
                              <p className="field-label">Root Cause / Resolution</p>
                              <p className="text-foreground">
                                {prob.rootCause ?? prob.resolution ?? "Under investigation."}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <Link
                              href={`/app/problems/${prob.id}`}
                              className="text-[11px] text-primary hover:underline flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" /> Full Problem Record
                            </Link>
                            <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Link Incident
                            </button>
                            <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" /> Raise Change
                            </button>
                            <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <BookOpen className="w-3 h-3" /> Publish KB Article
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          {displayed.length} record{displayed.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
