"use client";

import { useState } from "react";
import { GitBranch, Plus, Calendar, AlertTriangle, Package, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATE_CFG: Record<string, { label: string; color: string }> = {
  planning:        { label: "Planning",        color: "text-muted-foreground bg-muted" },
  testing:         { label: "Testing",         color: "text-blue-700 bg-blue-100" },
  cab_approval:    { label: "CAB Review",      color: "text-yellow-700 bg-yellow-100" },
  scheduled:       { label: "Scheduled",       color: "text-indigo-700 bg-indigo-100" },
  deployment:      { label: "Deploying",       color: "text-orange-700 bg-orange-100" },
  post_deployment: { label: "Post Deploy",     color: "text-green-700 bg-green-100" },
  complete:        { label: "Complete",        color: "text-green-700 bg-green-100" },
  failed:          { label: "Failed",          color: "text-red-700 bg-red-100" },
  rolled_back:     { label: "Rolled Back",     color: "text-red-700 bg-red-100" },
};

const RISK_COLOR: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

export default function ReleasesPage() {
  const { can } = useRBAC();
  const router = useRouter();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewRelease, setShowNewRelease] = useState(false);
  const [newReleaseName, setNewReleaseName] = useState("");
  const [newReleaseType, setNewReleaseType] = useState("Minor");
  const [newReleaseEnv, setNewReleaseEnv] = useState("Production");

  const releasesQuery = trpc.changes.listReleases.useQuery({ limit: 50 });
  const createRelease = trpc.changes.createRelease.useMutation({
    onSuccess: () => {
      void releasesQuery.refetch();

  if (!can("changes", "read")) return <AccessDenied module="Release Management" />;

      setShowNewRelease(false);
      setNewReleaseName("");
      toast.success("Release created");
    },
    onError: (e: any) => { console.error("changes.createRelease failed:", e); toast.error(e.message || "Failed to create release"); },
  });

  const releases = releasesQuery.data ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inFlight = releases.filter((r: any) => ["deployment", "post_deployment"].includes(r.state)).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awaitingCAB = releases.filter((r: any) => r.state === "cab_approval").length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failedTests = releases.filter((r: any) => (r.testsFailed ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Release Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Release Calendar · Deployment Tracking · Environment Management</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpandedId(null)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Calendar className="w-3 h-3" /> Release Calendar
          </button>
          <button
            onClick={() => setShowNewRelease(true)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Release
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Deployments In Flight", value: inFlight,     color: "text-orange-700" },
          { label: "Awaiting CAB",           value: awaitingCAB, color: "text-yellow-700" },
          { label: "Failing Tests",          value: failedTests, color: "text-red-700" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { label: "Planned This Week",      value: releases.filter((r: any) => r.state === "scheduled").length, color: "text-blue-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {releasesQuery.isLoading && (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      )}

      {releasesQuery.isError && (
        <div className="text-center py-8 text-muted-foreground text-[12px]">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
          Failed to load releases. Please try again.
        </div>
      )}

      {!releasesQuery.isLoading && !releasesQuery.isError && releases.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-[13px]">No releases found</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">Create a new release to get started</p>
        </div>
      )}

      {!releasesQuery.isLoading && releases.length > 0 && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {releases.map((rel: any) => {
            const sCfg = STATE_CFG[rel.state as string];
            const isExpanded = expandedId === rel.id;
            const deploymentSteps = (rel.deploymentSteps as number) ?? 0;
            const completedSteps = (rel.completedSteps as number) ?? 0;
            const testsPassed = (rel.testsPassed as number) ?? 0;
            const testsFailed = (rel.testsFailed as number) ?? 0;
            const rollbackPlan = (rel.rollbackPlan as boolean) ?? true;
            const progress = deploymentSteps > 0 ? Math.round((completedSteps / deploymentSteps) * 100) : 0;

            return (
              <div key={rel.id} className="bg-card border border-border rounded overflow-hidden">
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : rel.id)}
                >
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${RISK_COLOR[rel.riskLevel as string] ?? "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-mono text-[11px] text-primary">{(rel.number as string) ?? rel.id}</span>
                          <span className="status-badge text-muted-foreground bg-muted">{rel.type as string}</span>
                          <span className="status-badge text-blue-700 bg-blue-100">{rel.environment as string}</span>
                          <span className={`status-badge ${sCfg?.color}`}>{sCfg?.label}</span>
                          {rel.changeRef && <span className="font-mono text-[11px] text-muted-foreground/70">{rel.changeRef as string}</span>}
                          {!rollbackPlan && <span className="status-badge text-red-700 bg-red-100">⚠ No Rollback Plan</span>}
                        </div>
                        <p className="text-[13px] font-semibold text-foreground">{rel.name as string}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[11px] text-muted-foreground">
                          Planned: {rel.plannedDate ? new Date(rel.plannedDate as string).toLocaleString() : "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{(rel.owner as string) ?? (rel.ownerId as string) ?? "—"}</div>
                        <div className="flex items-center gap-1.5 mt-1 justify-end">
                          {testsFailed > 0 ? (
                            <span className="text-[10px] text-red-600 font-semibold">⚠ {testsFailed} test failures</span>
                          ) : testsPassed > 0 ? (
                            <span className="text-[10px] text-green-600">✓ {testsPassed} tests passed</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {deploymentSteps > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden max-w-xs">
                          <div className={`h-full rounded-full ${progress === 100 ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{completedSteps}/{deploymentSteps} steps</span>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-muted/30">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Deployment Plan</p>
                    {rel.deploymentPlan ? (
                      <div className="space-y-1">
                        {(Array.isArray(rel.deploymentPlan) ? rel.deploymentPlan : []).map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-[12px]">
                            <span className="font-mono text-[10px] text-muted-foreground/70 w-16 flex-shrink-0">{step.time ?? "—"}</span>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px]
                              ${step.status === "success" ? "bg-green-100 text-green-700" : step.status === "in_progress" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground/70"}`}>
                              {step.status === "success" ? "✓" : step.status === "in_progress" ? "▶" : "○"}
                            </span>
                            <span className={`flex-1 ${step.status === "in_progress" ? "font-semibold text-orange-700" : step.status === "pending" ? "text-muted-foreground/70" : "text-foreground/80"}`}>
                              {step.step ?? step.name ?? step}
                            </span>
                            <span className="text-muted-foreground/70">{step.duration ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/60">No deployment steps logged yet.</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={() => router.push(`/app/changes?search=${encodeURIComponent((rel.changeRef as string) ?? rel.id ?? "")}`)} className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">View Full Pipeline</button>
                      <button onClick={() => router.push(`/app/changes/new?type=emergency&source=rollback&release=${rel.id ?? ""}`)} className="px-3 py-1 border border-red-300 text-red-600 text-[11px] rounded hover:bg-red-50">Rollback</button>
                      <button onClick={() => router.push(`/app/changes?search=${encodeURIComponent((rel.changeRef as string) ?? rel.id ?? "")}`)} className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground">View Logs</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Release Modal */}
      {showNewRelease && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Create New Release</h2>
              <button onClick={() => setShowNewRelease(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Release Name</label>
                <input
                  value={newReleaseName}
                  onChange={(e) => setNewReleaseName(e.target.value)}
                  placeholder="e.g. Platform v3.15.0 — Feature release"
                  className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Type</label>
                  <select
                    value={newReleaseType}
                    onChange={(e) => setNewReleaseType(e.target.value)}
                    className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none focus:border-primary"
                  >
                    {["Patch", "Hotfix", "Minor", "Major"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Environment</label>
                  <select
                    value={newReleaseEnv}
                    onChange={(e) => setNewReleaseEnv(e.target.value)}
                    className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none focus:border-primary"
                  >
                    {["Production", "UAT", "Staging", "Dev"].map((e) => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewRelease(false)}
                className="px-3 py-1.5 text-[11px] border border-border rounded text-muted-foreground hover:bg-muted/30"
              >
                Cancel
              </button>
              <button
                disabled={!newReleaseName.trim() || createRelease.isPending}
                onClick={() => createRelease.mutate({ name: newReleaseName, version: "1.0.0", notes: newReleaseEnv })}
                className="px-4 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {createRelease.isPending ? "Creating..." : "Create Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
