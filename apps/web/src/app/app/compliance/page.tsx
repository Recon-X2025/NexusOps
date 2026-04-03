"use client";

import { useState } from "react";
import { CheckSquare, AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw, Shield, Target, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";

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
  const [showAddBaseline, setShowAddBaseline] = useState(false);
  const [baselineForm, setBaselineForm] = useState({ name: "", framework: "ISO 27001", scope: "", frequency: "quarterly" as "monthly"|"quarterly"|"annual" });
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  // @ts-ignore
  const auditsQuery = trpc.grc.listAudits.useQuery({ limit: 50 }, { enabled: canView });
  const risksQuery = trpc.grc.listRisks.useQuery({ limit: 50 }, { enabled: canView });

  const createAudit = trpc.grc.createAudit.useMutation({
    onSuccess: () => { toast.success("Compliance baseline/audit created"); setShowAddBaseline(false); setBaselineForm({ name: "", framework: "ISO 27001", scope: "", frequency: "quarterly" }); auditsQuery.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (!canView) return <AccessDenied module="Compliance" />;

  const completedAudits = auditsQuery.data?.filter((a: any) => a.status === "completed") ?? [];
  const auditsWithScore = completedAudits.filter((a: any) => a.score != null && Number(a.score) > 0);
  const avgScore: number | null = auditsWithScore.length > 0
    ? Math.round(auditsWithScore.reduce((s: number, a: any) => s + Number(a.score), 0) / auditsWithScore.length)
    : null;
  const totalFailedBaselines = risksQuery.data
    ? risksQuery.data.filter((r: any) => (r.severity === "critical" || r.severity === "high") && r.status !== "closed" && r.status !== "accepted").length
    : 0;

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
          {can("grc", "write") && (
            <button
              onClick={() => setShowAddBaseline(true)}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> Add Baseline
            </button>
          )}
        </div>
      </div>

      {/* Stats grid — mix of static baseline data and real risk/audit data */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded px-3 py-2">
          <div className={`text-xl font-bold ${avgScore !== null ? (avgScore >= 80 ? "text-green-700" : avgScore >= 60 ? "text-yellow-700" : "text-red-700") : "text-muted-foreground/50"}`}>{avgScore !== null ? `${avgScore}%` : "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Compliance Score</div>
        </div>
        <div className="bg-card border border-border rounded px-3 py-2">
          <div className={`text-xl font-bold ${totalFailedBaselines > 0 ? "text-red-700" : "text-green-700"}`}>{totalFailedBaselines}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">High/Critical Open Risks</div>
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
                      <button
                        onClick={() => setSelectedAuditId(selectedAuditId === a.id ? null : a.id)}
                        className="text-[11px] text-primary hover:underline"
                      >{selectedAuditId === a.id ? "Close" : "View"}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selectedAuditId && (() => {
            const a: any = auditsQuery.data?.find((x: any) => x.id === selectedAuditId);
            if (!a) return null;
            const findings = a.findings ?? [];
            return (
              <div className="border-t border-border px-4 py-3 bg-muted/20 text-[11px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-foreground text-[12px]">Audit: {a.title}</span>
                  <button onClick={() => setSelectedAuditId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><span className="text-muted-foreground/70">Framework:</span> <span className="font-medium">{a.framework ?? "—"}</span></div>
                  <div><span className="text-muted-foreground/70">Status:</span> <span className="font-medium capitalize">{a.status?.replace("_", " ")}</span></div>
                  <div><span className="text-muted-foreground/70">Score:</span> <span className={`font-bold ${a.score ? (Number(a.score) >= 80 ? "text-green-700" : "text-orange-700") : "text-muted-foreground"}`}>{a.score ? `${a.score}%` : "—"}</span></div>
                  {a.scope && <div className="col-span-3"><span className="text-muted-foreground/70">Scope:</span> {a.scope}</div>}
                  {a.description && <div className="col-span-3"><span className="text-muted-foreground/70">Description:</span> {a.description}</div>}
                </div>
                {findings.length > 0 ? (
                  <div>
                    <div className="font-semibold text-muted-foreground mb-1">Findings ({findings.length})</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {findings.map((f: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 bg-card rounded border border-border">
                          <span className={`status-badge capitalize text-[10px] ${FINDING_SEVERITY_COLOR[f.severity] ?? "bg-muted text-muted-foreground"}`}>{f.severity}</span>
                          <span className="flex-1 truncate">{f.title ?? f.description ?? "Finding"}</span>
                          <span className={`text-[10px] ${f.status === "closed" ? "text-green-600" : "text-orange-600"}`}>{f.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground/50">No findings recorded for this audit.</p>
                )}
              </div>
            );
          })()}
        </div>
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

      {/* Add Baseline Modal */}
      {showAddBaseline && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add Compliance Baseline / Audit</h2>
              <button onClick={() => setShowAddBaseline(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Audit Name <span className="text-red-500">*</span></label>
              <input value={baselineForm.name} onChange={(e) => setBaselineForm(f => ({...f, name: e.target.value}))} placeholder="e.g. ISO 27001 Annual Review" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Framework</label>
                <select value={baselineForm.framework} onChange={(e) => setBaselineForm(f => ({...f, framework: e.target.value}))} className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
                  {["ISO 27001","SOC 2","PCI-DSS","NIST CSF","CIS Controls","GDPR","HIPAA","ISO 9001"].map(fw => <option key={fw} value={fw}>{fw}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Frequency</label>
                <select value={baselineForm.frequency} onChange={(e) => setBaselineForm(f => ({...f, frequency: e.target.value as any}))} className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
                  {["monthly","quarterly","annual"].map(fr => <option key={fr} value={fr} className="capitalize">{fr.charAt(0).toUpperCase() + fr.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Scope</label>
              <input value={baselineForm.scope} onChange={(e) => setBaselineForm(f => ({...f, scope: e.target.value}))} placeholder="e.g. All production systems, Finance department" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddBaseline(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!baselineForm.name.trim()) { toast.error("Audit name is required"); return; } createAudit.mutate({ name: baselineForm.name.trim(), type: "compliance" as any, framework: baselineForm.framework, scope: baselineForm.scope || undefined } as any); }}
                disabled={createAudit.isPending}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
                {createAudit.isPending ? "Creating…" : "Create Baseline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
