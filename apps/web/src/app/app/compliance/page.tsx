"use client";

import { useState } from "react";
import { CheckSquare, AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw, Shield, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const AUDIT_STATUS_COLOR: Record<string, string> = {
  planned:     "text-slate-700 bg-slate-100",
  in_progress: "text-blue-700 bg-blue-100",
  completed:   "text-green-700 bg-green-100",
  cancelled:   "text-red-700 bg-red-100",
};

const RISK_STATUS_COLOR: Record<string, string> = {
  identified: "text-slate-700 bg-slate-100",
  assessed:   "text-yellow-700 bg-yellow-100",
  mitigating: "text-blue-700 bg-blue-100",
  accepted:   "text-purple-700 bg-purple-100",
  closed:     "text-green-700 bg-green-100",
};

const FINDING_SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
};

export default function CompliancePage() {
  const { can } = useRBAC();
  const canView = can("grc", "read");
  // @ts-ignore
  const auditsQuery = trpc.grc.listAudits.useQuery({ limit: 50 }, { enabled: canView });
  const risksQuery = trpc.grc.listRisks.useQuery({ limit: 50 }, { enabled: canView });

  if (!canView) return <AccessDenied module="Compliance" />;

  const avgScore: number | null = null;
  const totalFailedBaselines = 0;

  const openRisks = risksQuery.data
    ? risksQuery.data.filter((r: any) => r.status !== "closed" && r.status !== "accepted").length
    : null;

  const auditFindings = auditsQuery.data
    ? auditsQuery.data.flatMap((a: any) => (a.findings ?? []).map((f: any) => ({ ...f, auditTitle: a.title, auditStatus: a.status })))
    : [];

  const openAuditFindings = auditFindings.filter((f: any) => f.status !== "closed" && f.status !== "resolved");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Configuration Compliance</h1>
          <span className="text-[11px] text-muted-foreground/70">Policy Baselines · Audit Plans · Risk Register</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { auditsQuery.refetch(); risksQuery.refetch(); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Add Baseline
          </button>
        </div>
      </div>

      {/* Stats grid — mix of static baseline data and real risk/audit data */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded px-3 py-2">
          <div className={`text-xl font-bold text-muted-foreground/50`}>{avgScore !== null ? `${avgScore}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Compliance Score</div>
        </div>
        <div className="bg-card border border-border rounded px-3 py-2">
          <div className="text-xl font-bold text-muted-foreground/50">{totalFailedBaselines > 0 ? totalFailedBaselines : "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Failed Controls</div>
        </div>
        <div className="bg-card border border-border rounded px-3 py-2">
          {risksQuery.isLoading ? (
            <div className="text-xl font-bold text-muted-foreground animate-pulse">—</div>
          ) : (
            <div className={`text-xl font-bold ${openRisks && openRisks > 5 ? "text-orange-700" : "text-yellow-700"}`}>
              {openRisks ?? 0}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Risks (Live)</div>
        </div>
        <div className="bg-card border border-border rounded px-3 py-2">
          {auditsQuery.isLoading ? (
            <div className="text-xl font-bold text-muted-foreground animate-pulse">—</div>
          ) : (
            <div className={`text-xl font-bold ${openAuditFindings.length > 0 ? "text-orange-700" : "text-green-700"}`}>
              {openAuditFindings.length}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Audit Findings (Live)</div>
        </div>
      </div>

      {/* Policy Baseline Results */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Policy Baseline Results</span>
        </div>
        <div className="py-8 text-center">
          <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground/50">No policy baselines configured yet</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">Configure CIS/STIG/PCI baseline scans to see results here</p>
        </div>
      </div>

      {/* Failed Control Tests */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Failed Control Tests</span>
        </div>
        <div className="py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground/50">No failed control tests</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">Run a baseline scan to see failed tests here</p>
        </div>
      </div>

      {/* Audit Plans — live data */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Audit Plans (Live)</span>
          {auditsQuery.isLoading && (
            <span className="text-[10px] text-muted-foreground/70 animate-pulse">Loading…</span>
          )}
        </div>
        {auditsQuery.isLoading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted rounded" />
            ))}
          </div>
        ) : auditsQuery.error || !auditsQuery.data || auditsQuery.data.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[12px] text-muted-foreground/70">
              {auditsQuery.error ? "Failed to load audit plans." : "No audit plans found."}
            </p>
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Audit Title</th>
                <th>Scope</th>
                <th>Status</th>
                <th className="text-center">Findings</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(auditsQuery.data as any[]).map((a: any) => {
                const findings = (a.findings ?? []) as Array<{ id: string; title: string; severity: string; status: string }>;
                const openCount = findings.filter((f) => f.status !== "closed" && f.status !== "resolved").length;
                return (
                  <tr key={a.id}>
                    <td className="p-0">
                      <div className={`priority-bar ${a.status === "completed" ? "bg-green-500" : a.status === "in_progress" ? "bg-blue-500" : a.status === "cancelled" ? "bg-red-500" : "bg-border"}`} />
                    </td>
                    <td className="font-medium text-foreground">{a.title}</td>
                    <td className="text-muted-foreground text-[11px]">{a.scope ?? "—"}</td>
                    <td>
                      <span className={`status-badge capitalize ${AUDIT_STATUS_COLOR[a.status] ?? "text-muted-foreground bg-muted"}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-center">
                      {findings.length > 0 ? (
                        <span className={`font-bold text-[12px] ${openCount > 0 ? "text-orange-700" : "text-green-700"}`}>
                          {openCount > 0 ? `${openCount} open` : "0 open"} / {findings.length}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground/70 text-[11px]">
                      {a.startDate ? new Date(a.startDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="text-muted-foreground/70 text-[11px]">
                      {a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <button className="text-[11px] text-primary hover:underline">View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Open Risks — live data */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Open Risks (Live) {openRisks !== null && <span className="text-primary font-bold ml-1">{openRisks}</span>}
          </span>
          {risksQuery.isLoading && (
            <span className="text-[10px] text-muted-foreground/70 animate-pulse">Loading…</span>
          )}
        </div>
        {risksQuery.isLoading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted rounded" />
            ))}
          </div>
        ) : risksQuery.error || !risksQuery.data || risksQuery.data.filter((r: any) => r.status !== "closed" && r.status !== "accepted").length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[12px] text-muted-foreground/70">
              {risksQuery.error ? "Failed to load risks." : "No open risks found."}
            </p>
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Risk ID</th>
                <th>Title</th>
                <th>Category</th>
                <th className="text-center">Score</th>
                <th>Status</th>
                <th>Treatment</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(risksQuery.data as any[])
                .filter((r: any) => r.status !== "closed" && r.status !== "accepted")
                .map((r: any) => (
                  <tr key={r.id}>
                    <td className="p-0">
                      <div className={`priority-bar ${r.riskScore >= 16 ? "bg-red-600" : r.riskScore >= 9 ? "bg-orange-500" : r.riskScore >= 4 ? "bg-yellow-500" : "bg-green-500"}`} />
                    </td>
                    <td className="font-mono text-[11px] text-primary">{r.number}</td>
                    <td className="font-medium text-foreground">{r.title}</td>
                    <td className="text-muted-foreground text-[11px] capitalize">{r.category}</td>
                    <td className="text-center">
                      <span className={`font-bold text-[12px] ${r.riskScore >= 16 ? "text-red-700" : r.riskScore >= 9 ? "text-orange-700" : r.riskScore >= 4 ? "text-yellow-600" : "text-green-700"}`}>
                        {r.riskScore}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge capitalize ${RISK_STATUS_COLOR[r.status] ?? "text-muted-foreground bg-muted"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.treatment ? (
                        <span className="status-badge capitalize text-blue-700 bg-blue-100">{r.treatment}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground/70 text-[11px]">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
