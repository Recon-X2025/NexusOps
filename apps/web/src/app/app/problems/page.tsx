"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
  X,
  Package,
} from "lucide-react";

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  new:                   { label: "New",          color: "text-muted-foreground bg-muted" },
  investigation:         { label: "In Progress",  color: "text-blue-700 bg-blue-100" },
  root_cause_identified: { label: "RCA",          color: "text-orange-700 bg-orange-100" },
  known_error:           { label: "Known Error",  color: "text-red-700 bg-red-100" },
  resolved:              { label: "Resolved",     color: "text-green-700 bg-green-100" },
  closed:                { label: "Closed",       color: "text-muted-foreground bg-muted" },
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
  { key: "all",                   label: "All Problems", status: undefined,                module: "problems" as const, action: "read"  as const },
  { key: "root_cause_identified", label: "RCA",          status: "root_cause_identified",  module: "problems" as const, action: "write" as const },
  { key: "known_error",           label: "Known Errors", status: "known_error",            module: "problems" as const, action: "write" as const },
  { key: "investigation",         label: "In Progress",  status: "investigation",          module: "problems" as const, action: "read"  as const },
  { key: "resolved",              label: "Resolved",     status: "resolved",               module: "problems" as const, action: "read"  as const },
];

export default function ProblemsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = TABS.filter((t) => can(t.module, t.action));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? "all");
  const [showNewProblem, setShowNewProblem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) setActiveTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, activeTab]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeStatus = TABS.find((t) => t.key === activeTab)?.status;

  const { data: allData, isLoading, refetch } = trpc.changes.listProblems.useQuery({ limit: 100 }, mergeTrpcQueryOpts("changes.listProblems", { refetchOnWindowFocus: false },));

  const createProblem = trpc.changes.createProblem.useMutation({
    onSuccess: (prob) => { toast.success(`Problem ${prob?.number ?? ""} created`); setShowNewProblem(false); setNewTitle(""); setNewDesc(""); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const publishToKB = trpc.changes.publishProblemToKB.useMutation({
    onSuccess: (article: any) => toast.success(`Published to Knowledge Base as "${article?.title ?? "article"}"`),
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const updateProblem = trpc.changes.updateProblem.useMutation({
    onSuccess: () => { toast.success("Problem updated"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const { data: releasesData } = trpc.changes.listReleases.useQuery({ limit: 100 }, mergeTrpcQueryOpts("changes.listReleases", undefined));
  const releases = releasesData ?? [];

  if (!can("problems", "read")) return <AccessDenied module="Problem Management" />;

  type ProblemItem = NonNullable<typeof allData>[number];
  const allProblems: ProblemItem[] = allData ?? [];

  const displayed = activeTab === "all"
    ? allProblems
    : activeTab === "root_cause_identified"
      ? allProblems.filter((p) => !!p.rootCause)
      : activeTab === "known_error"
        ? allProblems.filter((p) => p.status === "known_error" || !!p.workaround)
        : activeStatus
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
          <button
            onClick={() => setActiveTab("known_error")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-accent">
            <BookOpen className="w-3 h-3" /> Known Errors DB
          </button>
          {can("problems", "write") && (
            <button
              onClick={() => setShowNewProblem(true)}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-medium rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Problem
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: "Open Problems",  value: openProblems.length, color: "text-blue-700" },
          { label: "Known Errors",   value: knownErrors.length,  color: "text-red-700" },
          { label: "Under RCA",      value: allProblems.filter((p) => p.status === "investigation").length, color: "text-orange-700" },
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
                <button
                  onClick={() => publishToKB.mutate({ problemId: ke.id })}
                  disabled={publishToKB.isPending}
                  className="text-[11px] text-primary hover:underline disabled:opacity-50">
                  {publishToKB.isPending ? "Publishing…" : "Publish to KB"}
                </button>
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
          const cnt = tab.key === "root_cause_identified"
            ? allProblems.filter((p) => !!p.rootCause).length
            : tab.key === "known_error"
              ? allProblems.filter((p) => p.status === "known_error" || !!p.workaround).length
              : tab.status
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
              {tab.key === "known_error" && cnt !== undefined && cnt > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                  {cnt}
                </span>
              )}
              {tab.key === "root_cause_identified" && cnt !== undefined && cnt > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold">
                  {cnt}
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
                {activeTab !== "root_cause_identified" && activeTab !== "known_error" && (
                  <th>Title</th>
                )}
                {activeTab !== "root_cause_identified" && activeTab !== "known_error" ? (
                  <>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Workaround</th>
                    <th>Assignee</th>
                    <th className="text-right uppercase">Action</th>
                  </>
                ) : activeTab === "root_cause_identified" ? (
                  <th>Root Cause Analysis</th>
                ) : (
                  <th>Known Error Database (KEDB)</th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayed.map((prob) => {
                const pCfg = PRIORITY_CONFIG[prob.priority ?? ""] ?? { label: prob.priority ?? "—", bar: "bg-slate-400" };
                const sCfg = STATE_CONFIG[prob.status];
                const isKnownError = prob.status === "known_error";
                return (
                  <Fragment key={prob.id}>
                    <tr
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
                      {activeTab !== "root_cause_identified" && activeTab !== "known_error" && (
                        <td className="max-w-xs">
                          <div className="flex items-center gap-1">
                            {isKnownError && (
                              <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" aria-hidden />
                            )}
                            <span className="truncate text-foreground">{prob.title}</span>
                            {prob.releaseId && (
                              (() => {
                                const rel = releases.find((r) => r.id === prob.releaseId);
                                return rel ? (
                                  <span className="ml-1.5 px-1 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-medium whitespace-nowrap">
                                    Rel: {rel.version}
                                  </span>
                                ) : null;
                              })()
                            )}
                          </div>
                        </td>
                      )}
                      {activeTab !== "root_cause_identified" && activeTab !== "known_error" ? (
                        <>
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
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={prob.releaseId || ""}
                                onChange={(e) => {
                                  const relId = e.target.value || null;
                                  updateProblem.mutate({ id: prob.id, releaseId: relId });
                                }}
                                disabled={updateProblem.isPending}
                                className="text-[11px] bg-background border border-border rounded px-2 py-1 text-blue-500 outline-none font-medium cursor-pointer hover:bg-accent/50"
                              >
                                <option value="">Link Release</option>
                                {releases.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} ({r.version})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </>
                      ) : activeTab === "root_cause_identified" ? (
                        <td className="max-w-xs text-foreground text-[12px] truncate">
                          {prob.rootCause || <span className="text-muted-foreground/50 italic">Under investigation.</span>}
                        </td>
                      ) : (
                        <td className="max-w-xs text-foreground text-[12px] truncate">
                          {prob.workaround || <span className="text-muted-foreground/50 italic">None documented.</span>}
                        </td>
                      )}
                    </tr>
                    {expandedId === prob.id && (
                      <tr key={`${prob.id}-expanded`} className="bg-muted/20">
                        <td />
                        <td colSpan={activeTab === "root_cause_identified" || activeTab === "known_error" ? 2 : 7} className="py-3 px-4">
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
                            <button
                              onClick={() => router.push(`/app/tickets?problem=${prob.id}`)}
                              className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Link Incident
                            </button>
                            <button
                              onClick={() => router.push(`/app/changes/new?fromProblem=${prob.id}&title=${encodeURIComponent("Fix: " + prob.title)}`)}
                              className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" /> Raise Change
                            </button>
                            <button
                              onClick={() => publishToKB.mutate({ problemId: prob.id })}
                              disabled={publishToKB.isPending}
                              className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50 font-medium">
                              <BookOpen className="w-3 h-3" /> Publish KB Article
                            </button>
                            <div className="flex items-center gap-1 ml-auto border-l border-border pl-3">
                              {/* Release linking is now in the main table row */}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          {displayed.length} record{displayed.length !== 1 ? "s" : ""}
        </div>
      </div>

    {/* New Problem Modal */}
    {showNewProblem && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">New Problem Record</h2>
            <button onClick={() => setShowNewProblem(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Title <span className="text-red-500">*</span></label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Describe the problem…" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Description</label>
            <textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Symptoms, affected services, initial investigation…" className="px-3 py-2 text-sm border border-border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Priority</label>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
              {["critical","high","medium","low"].map(p => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowNewProblem(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => { if (!newTitle.trim()) { toast.error("Title is required"); return; } createProblem.mutate({ title: newTitle.trim(), description: newDesc.trim() || undefined, priority: newPriority }); }}
              disabled={createProblem.isPending}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
              {createProblem.isPending ? "Creating…" : "Create Problem"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
