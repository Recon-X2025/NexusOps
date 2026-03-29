"use client";

import { useState, useEffect } from "react";
import {
  Scale, AlertTriangle, CheckCircle2, Clock, FileText, Plus,
  ChevronRight, BarChart2, Shield, Layers, BookOpen, AlertCircle, Loader2,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const GRC_TABS = [
  { key: "risk",        label: "Risk Register",        module: "risk"    as const, action: "read" as const },
  { key: "policy",      label: "Policy Compliance",    module: "policy"  as const, action: "read" as const },
  { key: "audit",       label: "Audit Management",     module: "audit"   as const, action: "read" as const },
  { key: "bcp",         label: "Business Continuity",  module: "grc"     as const, action: "read" as const },
  { key: "vendor_risk", label: "Vendor Risk",          module: "vendors" as const, action: "read" as const },
];


const RISK_SCORE_COLOR = (s: number) =>
  s >= 15 ? "text-red-700 font-bold" : s >= 10 ? "text-orange-600 font-semibold" : s >= 5 ? "text-yellow-600" : "text-green-700";

export default function GRCPage() {
  const { can } = useRBAC();
  const visibleTabs = GRC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "risk");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("grc", "read") && !can("risk", "read") && !can("audit", "read") && !can("policy", "read")) {
    return <AccessDenied module="Risk & Compliance" />;
  }

  const { data: risksData, isLoading: risksLoading } = trpc.grc.listRisks.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );
  const { data: policiesData, isLoading: policiesLoading } = trpc.grc.listPolicies.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );
  const { data: auditsData, isLoading: auditsLoading } = trpc.grc.listAudits.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  const { data: vendorRisksData, isLoading: vendorRisksLoading } = trpc.grc.listVendorRisks.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  type RiskItem = NonNullable<typeof risksData>[number];
  type PolicyItem = NonNullable<typeof policiesData>[number];
  type AuditItem = NonNullable<typeof auditsData>[number];
  type VendorRiskItem = NonNullable<typeof vendorRisksData>[number];

  const risks: RiskItem[] = risksData ?? [];
  const policies: PolicyItem[] = policiesData ?? [];
  const audits: AuditItem[] = auditsData ?? [];
  const vendorRisks: VendorRiskItem[] = vendorRisksData ?? [];

  const createRiskMutation = trpc.grc.createRisk.useMutation({ onSuccess: () => { (trpc as any).grc?.listRisks?.invalidate?.(); setShowNewRisk(false); setRiskForm(EMPTY_RISK); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const EMPTY_RISK = { title: "", category: "operational" as const, likelihood: 3, impact: 3, treatment: "mitigate" as const, description: "", mitigationPlan: "" };
  const [showNewRisk, setShowNewRisk] = useState(false);
  const [riskForm, setRiskForm]       = useState(EMPTY_RISK);

  // DB stores pre-computed riskScore; fall back to likelihood × impact if missing
  const getRiskScore = (r: RiskItem) => r.riskScore ?? (r.likelihood ?? 0) * (r.impact ?? 0);
  // DB status values: "identified" | "assessed" | "mitigating" | "accepted" | "closed"
  const openRisks = risks.filter((r) => ["identified", "assessed", "mitigating"].includes(r.status ?? ""));
  const highRisks = risks.filter((r) => getRiskScore(r) >= 15);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Governance, Risk & Compliance</h1>
          <span className="text-[11px] text-muted-foreground/70">Risk Register · Policy · Audit · BCP · Vendor Risk</span>
        </div>
        <button
          onClick={() => setShowNewRisk(v => !v)}
          className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> {showNewRisk ? "Cancel" : "New Risk"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "High/Critical Risks", value: highRisks.length,  color: "text-red-700",  border: "border-red-200" },
          { label: "Open Risks",           value: openRisks.length, color: "text-orange-700", border: "border-border" },
          { label: "Policy Issues",        value: policies.filter((p) => p.status === "review" || p.status === "draft").length, color: "text-yellow-700", border: "border-border" },
          { label: "Audit Findings",       value: audits.reduce((s, a) => s + (Array.isArray(a.findings) ? a.findings.length : 0), 0), color: "text-blue-700", border: "border-border" },
        ].map((k) => (
          <div key={k.label} className={`bg-card border rounded px-3 py-2 ${k.border}`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {showNewRisk && (
        <div className="bg-card border border-border rounded p-4 space-y-3">
          <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Register New Risk</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Risk Title *</label>
              <input className="w-full border border-border rounded px-2 py-1.5 text-[12px]" placeholder="e.g. Unpatched critical vulnerability in production" value={riskForm.title} onChange={e => setRiskForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Category</label>
              <select className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={riskForm.category} onChange={e => setRiskForm(f => ({ ...f, category: e.target.value as any }))}>
                {["operational","financial","strategic","compliance","technology","reputational"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Likelihood (1–5)</label>
              <input type="number" min={1} max={5} className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={riskForm.likelihood} onChange={e => setRiskForm(f => ({ ...f, likelihood: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Impact (1–5)</label>
              <input type="number" min={1} max={5} className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={riskForm.impact} onChange={e => setRiskForm(f => ({ ...f, impact: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Treatment</label>
              <select className="w-full border border-border rounded px-2 py-1.5 text-[12px]" value={riskForm.treatment} onChange={e => setRiskForm(f => ({ ...f, treatment: e.target.value as any }))}>
                {["accept","mitigate","transfer","avoid"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Description</label>
              <textarea className="w-full border border-border rounded px-2 py-1.5 text-[12px] h-16 resize-none" placeholder="Describe the risk scenario…" value={riskForm.description} onChange={e => setRiskForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Mitigation Plan</label>
              <textarea className="w-full border border-border rounded px-2 py-1.5 text-[12px] h-14 resize-none" placeholder="Steps to mitigate this risk…" value={riskForm.mitigationPlan} onChange={e => setRiskForm(f => ({ ...f, mitigationPlan: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-1 rounded ${riskForm.likelihood * riskForm.impact >= 15 ? "bg-red-100 text-red-700" : riskForm.likelihood * riskForm.impact >= 10 ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
              Risk Score: {riskForm.likelihood * riskForm.impact} / 25
            </span>
            <button
              disabled={createRiskMutation.isPending || !riskForm.title}
              onClick={() => createRiskMutation.mutate(riskForm)}
              className="px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createRiskMutation.isPending ? "Saving…" : "Create Risk"}
            </button>
            {createRiskMutation.isError && <span className="text-[11px] text-red-600">{(createRiskMutation.error as any)?.message}</span>}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "risk" && (
          risksLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading risk register…</span>
            </div>
          ) : risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Shield className="w-5 h-5 opacity-30" />
              <span className="text-xs">No risks found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Risk ID</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th className="text-center">Likelihood</th>
                  <th className="text-center">Impact</th>
                  <th className="text-center">Score</th>
                  <th>Treatment</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => {
                  const score = getRiskScore(r);
                      const rStatus = r.status ?? "";
                      const dueDate = r.reviewDate ? new Date(r.reviewDate).toISOString().split("T")[0] : "";
                  return (
                    <tr key={r.id}>
                      <td className="p-0"><div className={`priority-bar ${score >= 15 ? "bg-red-600" : score >= 10 ? "bg-orange-500" : "bg-yellow-400"}`} /></td>
                      <td><span className="text-primary text-[11px] font-mono hover:underline cursor-pointer">{r.number ?? r.id}</span></td>
                      <td className="max-w-xs"><span className="truncate block">{r.title}</span></td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{r.category ?? "—"}</span></td>
                      <td className="text-center font-semibold text-foreground/80">{r.likelihood ?? "—"}/5</td>
                      <td className="text-center font-semibold text-foreground/80">{r.impact ?? "—"}/5</td>
                      <td className="text-center"><span className={`text-[14px] ${RISK_SCORE_COLOR(score)}`}>{score}</span></td>
                      <td><span className="status-badge text-blue-700 bg-blue-100 capitalize">{r.treatment ?? "—"}</span></td>
                      <td className="text-muted-foreground">{r.ownerId ? `ID:${r.ownerId.slice(-6)}` : "—"}</td>
                      <td>
                        <span className={`status-badge capitalize ${rStatus === "identified" || rStatus === "assessed" ? "text-red-700 bg-red-100" : rStatus === "mitigating" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100"}`}>
                          {rStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className={`text-[11px] ${dueDate && new Date(dueDate) < new Date() ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{dueDate || "—"}</td>
                      <td className="text-center"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">{Array.isArray(r.controls) ? r.controls.length : 0}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "policy" && (
          policiesLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading policies…</span>
            </div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <FileText className="w-5 h-5 opacity-30" />
              <span className="text-xs">No policies found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Policy ID</th>
                  <th>Policy Name</th>
                  <th>Owner</th>
                  <th>Last Review</th>
                  <th>Next Review</th>
                  <th>Compliant</th>
                  <th>Non-Compliant</th>
                  <th>Exceptions</th>
                  <th>Status</th>
                  <th>Compliance %</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  // DB has no compliance counters; derive presence from status
                  const compliant = 0;
                  const nonCompliant = 0;
                  const total = compliant + nonCompliant;
                  const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
                  const pStatus = p.status ?? "";
                  // DB columns: lastReviewed, nextReview (timestamps)
                  const lastReview = p.lastReviewed ? new Date(p.lastReviewed).toISOString().split("T")[0] : "—";
                  const nextReview = p.nextReview ? new Date(p.nextReview).toISOString().split("T")[0] : "—";
                  return (
                    <tr key={p.id}>
                      <td className="font-mono text-[11px] text-primary">{p.id.slice(-8).toUpperCase()}</td>
                      <td className="font-medium text-foreground">{p.title}</td>
                      <td className="text-muted-foreground">{p.ownerId ? `ID:${p.ownerId.slice(-6)}` : "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{lastReview}</td>
                      <td className={`text-[11px] ${pStatus === "review" ? "text-yellow-600 font-semibold" : "text-muted-foreground"}`}>
                        {nextReview}
                      </td>
                      <td className="text-green-700 font-semibold text-center">{compliant}</td>
                      <td className="text-red-600 font-semibold text-center">{nonCompliant}</td>
                      <td className="text-yellow-600 text-center">0</td>
                      <td>
                        <span className={`status-badge capitalize ${pStatus === "active" ? "text-green-700 bg-green-100" : pStatus === "overdue" ? "text-red-700 bg-red-100" : "text-yellow-700 bg-yellow-100"}`}>
                          {pStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "audit" && (
          auditsLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading audits…</span>
            </div>
          ) : audits.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <BarChart2 className="w-5 h-5 opacity-30" />
              <span className="text-xs">No audits found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Audit ID</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Auditor</th>
                  <th>State</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="text-center">Findings</th>
                  <th className="text-center">Critical</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => {
                    // DB: scope maps to audit type label; findings is jsonb array
                    const aType = a.scope ?? "Internal";
                    const aState = a.status ?? "";
                    const findingsArr = Array.isArray(a.findings) ? a.findings : [];
                    const aFindings = findingsArr.length;
                    const aCritical = findingsArr.filter((f: { severity?: string }) => f.severity === "critical").length;
                    return (
                      <tr key={a.id}>
                        <td className="font-mono text-[11px] text-primary">{a.id.slice(-8).toUpperCase()}</td>
                        <td className="font-medium text-foreground">{a.title}</td>
                        <td><span className={`status-badge ${aType === "External" ? "text-purple-700 bg-purple-100" : "text-blue-700 bg-blue-100"}`}>{aType}</span></td>
                        <td className="text-muted-foreground">{a.auditorId ? `ID:${a.auditorId.slice(-6)}` : "—"}</td>
                        <td>
                          <span className={`status-badge capitalize ${aState === "completed" ? "text-green-700 bg-green-100" : aState === "in_progress" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>
                            {aState.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="text-muted-foreground text-[11px]">{a.startDate ? new Date(a.startDate).toISOString().split("T")[0] : "—"}</td>
                        <td className="text-muted-foreground text-[11px]">{a.endDate ? new Date(a.endDate).toISOString().split("T")[0] : "—"}</td>
                        <td className="text-center font-semibold">{aFindings}</td>
                        <td className="text-center">
                          {aCritical > 0 ? <span className="text-red-700 font-bold">{aCritical}</span> : <span className="text-green-600">0</span>}
                        </td>
                        <td className="text-muted-foreground">{a.auditorId ? `ID:${a.auditorId.slice(-6)}` : "—"}</td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === "bcp" && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">No BCP / DR records configured</p>
            <p className="text-[11px] text-muted-foreground/60">Add RPO/RTO targets and DR test schedules to track business continuity readiness.</p>
          </div>
        )}

        {tab === "vendor_risk" && (
          vendorRisksLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading vendor risks…</span>
            </div>
          ) : vendorRisks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Layers className="w-5 h-5 opacity-30" />
              <span className="text-xs">No vendor risk assessments found.</span>
            </div>
          ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Tier</th>
                <th className="text-center">Risk Score</th>
                <th>Inherent Risk</th>
                <th>Residual Risk</th>
                <th>Last Assessment</th>
                <th>Next Assessment</th>
                <th className="text-center">Controls</th>
                <th className="text-center">Issues</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorRisks.map((v: any) => {
                const score = Number(v.riskScore ?? 0);
                const lastAssess = v.lastAssessmentDate ? new Date(v.lastAssessmentDate).toISOString().split("T")[0] : "—";
                const nextAssess = v.nextAssessmentDate ? new Date(v.nextAssessmentDate).toISOString().split("T")[0] : "—";
                const isOverdue = v.nextAssessmentDate && new Date(v.nextAssessmentDate) < new Date();
                return (
                  <tr key={v.id}>
                    <td className="font-medium text-foreground">{v.vendorName ?? `Vendor …${v.vendorId?.slice(-6) ?? "—"}`}</td>
                    <td><span className={`status-badge ${v.tier === "Tier 1" || v.tier === "tier1" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>{v.tier ?? "—"}</span></td>
                    <td className="text-center"><span className={`font-bold text-[13px] ${RISK_SCORE_COLOR(score)}`}>{score}</span></td>
                    <td><span className={`status-badge ${SEVERITY_COLOR_MAP[v.inherentRisk ?? "Medium"] ?? "text-muted-foreground bg-muted"}`}>{v.inherentRisk ?? "—"}</span></td>
                    <td><span className={`status-badge ${SEVERITY_COLOR_MAP[v.residualRisk ?? "Low"] ?? "text-muted-foreground bg-muted"}`}>{v.residualRisk ?? "—"}</span></td>
                    <td className="text-muted-foreground text-[11px]">{lastAssess}</td>
                    <td className={`text-[11px] ${isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{nextAssess}</td>
                    <td className="text-center">{Array.isArray(v.controls) ? v.controls.length : (v.controlCount ?? 0)}</td>
                    <td className="text-center">{(v.openIssues ?? 0) > 0 ? <span className="text-red-700 font-bold">{v.openIssues}</span> : <span className="text-green-600">0</span>}</td>
                    <td>
                      <span className={`status-badge capitalize ${
                        v.status === "approved" ? "text-green-700 bg-green-100"
                          : v.status === "conditionally_approved" ? "text-yellow-700 bg-yellow-100"
                          : "text-red-700 bg-red-100"
                      }`}>{(v.status ?? "pending").replace(/_/g, " ")}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )
        )}
      </div>
    </div>
  );
}

const SEVERITY_COLOR_MAP: Record<string, string> = {
  Critical: "text-red-700 bg-red-100",
  High: "text-orange-700 bg-orange-100",
  Medium: "text-yellow-700 bg-yellow-100",
  Low: "text-green-700 bg-green-100",
};
