"use client";

import { useState, useEffect } from "react";
import {
  Shield, CheckCircle2, Plus, Target, ChevronRight, Loader2, X,
  FileText,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

const SEC_TABS = [
  { key: "vulnerabilities", label: "Vulnerabilities",      module: "vulnerabilities" as const, action: "read" as const },
  { key: "incidents",       label: "Security Incidents",   module: "security"        as const, action: "read" as const },
  { key: "threat_intel",    label: "Threat Intelligence",  module: "threat_intel"    as const, action: "read" as const },
  { key: "compliance",      label: "Config Compliance",    module: "grc"             as const, action: "read" as const },
];

const SEVERITY_COLOR: Record<string, string> = {
  critical:      "text-red-700 bg-red-100",
  high:          "text-orange-700 bg-orange-100",
  medium:        "text-yellow-700 bg-yellow-100",
  low:           "text-green-700 bg-green-100",
  informational: "text-muted-foreground bg-muted",
};

const SEC_INCIDENT_STATE: Record<string, string> = {
  new:          "text-muted-foreground bg-muted",
  triage:       "text-muted-foreground bg-muted",
  containment:  "text-orange-700 bg-orange-100",
  eradication:  "text-purple-700 bg-purple-100",
  recovery:     "text-indigo-700 bg-indigo-100",
  closed:       "text-green-700 bg-green-100",
  false_positive: "text-muted-foreground bg-muted",
};

const VULN_STATE_COLOR: Record<string, string> = {
  open:           "text-red-700 bg-red-100",
  in_remediation: "text-blue-700 bg-blue-100",
  resolved:       "text-green-700 bg-green-100",
  accepted:       "text-muted-foreground bg-muted",
  false_positive: "text-muted-foreground bg-muted",
};

// Mirrors STATE_MACHINE in apps/api/src/routers/security.ts (transition mutation).
const SEC_INCIDENT_TRANSITIONS: Record<string, string[]> = {
  new:            ["triage"],
  triage:         ["containment", "false_positive"],
  containment:    ["eradication"],
  eradication:    ["recovery"],
  recovery:       ["closed"],
  closed:         [],
  false_positive: [],
};

const SEC_TRANSITION_LABEL: Record<string, string> = {
  triage:         "Start Triage",
  containment:    "Mark Contained",
  eradication:    "Begin Eradication",
  recovery:       "Move to Recovery",
  closed:         "Close Incident",
  false_positive: "Mark False Positive",
};

export default function SecurityOpsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = SEC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "vulnerabilities");
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [incForm, setIncForm] = useState({ title: "", description: "", severity: "medium" as "critical"|"high"|"medium"|"low"|"informational", attackVector: "" });
  const [investigatingId, setInvestigatingId] = useState<string | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [remediateNote, setRemediateNote] = useState("");
  const [showNewThreatIntel, setShowNewThreatIntel] = useState(false);
  const [tiForm, setTiForm] = useState({ incidentId: "", description: "", documentUri: "" });
  const [showNewVulnerability, setShowNewVulnerability] = useState(false);
  const [vulnForm, setVulnForm] = useState({ title: "", cveId: "", severity: "medium", incidentId: "" });

  const utils = trpc.useUtils();

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  const { data: vulns, isLoading: vulnsLoading, refetch: refetchVulns } = trpc.security.listVulnerabilities.useQuery({ limit: 100 }, mergeTrpcQueryOpts("security.listVulnerabilities", { refetchOnWindowFocus: false },));
  const { data: incidents, isLoading: incidentsLoading, refetch: refetchIncidents } = trpc.security.listIncidents.useQuery({ limit: 100 }, mergeTrpcQueryOpts("security.listIncidents", { refetchOnWindowFocus: false },));

  // GRC data for Config Compliance tab
  const { data: grcAudits, isLoading: auditsLoading } = trpc.grc.listAudits.useQuery(undefined, mergeTrpcQueryOpts("grc.listAudits", { enabled: can("grc", "read"), refetchOnWindowFocus: false },));
  const { data: grcPolicies, isLoading: policiesLoading } = trpc.grc.listPolicies.useQuery({ limit: 50 }, mergeTrpcQueryOpts("grc.listPolicies", { enabled: can("grc", "read"), refetchOnWindowFocus: false },));
  const { data: grcRisks } = trpc.grc.listRisks.useQuery({ limit: 50 }, mergeTrpcQueryOpts("grc.listRisks", { enabled: can("grc", "read"), refetchOnWindowFocus: false },));

  const { data: threatIntel, isLoading: threatIntelLoading } = trpc.security.listThreatIntel.useQuery({ limit: 100 }, mergeTrpcQueryOpts("security.listThreatIntel", { enabled: can("security", "read") && tab === "threat_intel", refetchOnWindowFocus: false },));


  const createIncident = trpc.security.createIncident.useMutation({
    onSuccess: (inc: any) => { toast.success(`Security incident ${inc?.id?.slice(0,8) ?? ""} created`); setShowNewIncident(false); setIncForm({ title: "", description: "", severity: "medium", attackVector: "" }); refetchIncidents(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const transitionIncident = trpc.security.transition.useMutation({
    onSuccess: (inc: any) => { toast.success(`Incident moved to ${String(inc?.status ?? "").replace(/_/g, " ")}`); refetchIncidents(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update incident"),
  });

  const remediateVuln = trpc.security.remediateVulnerability.useMutation({
    onSuccess: () => { toast.success("Vulnerability marked as remediated"); setRemediatingId(null); setRemediateNote(""); refetchVulns(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remediate"),
  });

  const createThreatIntel = trpc.security.createThreatIntel.useMutation({
    onSuccess: () => { toast.success("Threat Intelligence feed connected"); setShowNewThreatIntel(false); setTiForm({ incidentId: "", description: "", documentUri: "" }); void utils.security.listThreatIntel.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add threat intel"),
  });

  const createVulnerability = trpc.security.createVulnerability.useMutation({
    onSuccess: () => { toast.success("Vulnerability added"); setShowNewVulnerability(false); setVulnForm({ title: "", cveId: "", severity: "medium", incidentId: "" }); void utils.security.listVulnerabilities.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add vulnerability"),
  });

  if (!can("security", "read") && !can("vulnerabilities", "read") && !can("grc", "read")) {
    return <AccessDenied module="Security Operations" />;
  }

  type VulnItem = NonNullable<typeof vulns>[number];
  type IncidentItem = NonNullable<typeof incidents>["items"][number];
  const vulnList: VulnItem[] = vulns ?? [];
  const incidentList: IncidentItem[] = incidents?.items ?? [];
  const threatIntelList: any[] = (threatIntel as any[]) ?? [];

  const critVulns = vulnList.filter((v) => v.severity === "critical" && v.status !== "remediated").length;
  const overdueVulns = vulnList.filter((v) => {
    if (v.status === "remediated" || !v.discoveredAt) return false;
    const days = Math.floor((Date.now() - new Date(v.discoveredAt).getTime()) / 86400000);
    return days > 14;
  }).length;
  const openSIRs = incidentList.filter((s) => !["closed", "false_positive"].includes(s.status)).length;
  const iocCount = incidentList.reduce((acc, inc) => acc + (inc.iocs?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-500" />
          <h1 className="text-body-sm font-semibold text-foreground">Security Operations</h1>
          <span className="text-[11px] text-muted-foreground">Vulnerability Response · SecOps · Threat Intel</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toast.info("To import scan results, export from your scanner (Nessus, Qualys, Trivy) as CSV/JSON and use the API endpoint POST /api/trpc/security.createVulnerability. Bulk import via API is supported.", { duration: 6000 })}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-accent text-muted-foreground">
            <Target className="w-3 h-3" /> Import Scan Results
          </button>
          {can("security", "write") && (
            <button
              onClick={() => setShowNewIncident(true)}
              className="flex items-center gap-1 px-3 py-1 bg-destructive text-destructive-foreground text-[11px] rounded hover:bg-destructive/90">
              <Plus className="w-3 h-3" /> New Security Incident
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: "Critical Vulns Open",  value: critVulns,    color: "text-red-700",    border: "border-red-200 bg-red-50/30" },
          { label: "Overdue Remediation",  value: overdueVulns, color: "text-orange-700", border: "border-orange-200" },
          { label: "Active Sec Incidents", value: openSIRs,     color: "text-purple-700", border: "border-purple-200" },
          { label: "IOCs Blocked",         value: iocCount > 0 ? iocCount : "—", color: "text-green-700",  border: "border-green-200" },
        ].map((k) => (
          <div key={k.label} className={`bg-card border rounded px-3 py-2 ${k.border}`}>
            <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {t.key === "vulnerabilities" && critVulns > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">{critVulns}</span>
            )}
            {t.key === "incidents" && openSIRs > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">{openSIRs}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-card border border-border rounded-b overflow-hidden">

        {/* — Vulnerabilities — */}
        {tab === "vulnerabilities" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2 pt-2">
              <div className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">Detected Vulnerabilities</div>
              <button className="text-[11px] text-primary hover:underline" onClick={() => setShowNewVulnerability(true)}>+ Add Vulnerability</button>
            </div>
          {vulnsLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-caption">Loading vulnerabilities…</span>
            </div>
          ) : vulnList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Shield className="w-5 h-5 opacity-30" />
              <span className="text-caption">No vulnerabilities found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th className="w-4" />
                      <th>CVE</th>
                      <th>Title</th>
                      <th>Affected Assets</th>
                      <th className="text-center">CVSS</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Discovered</th>
                      <th>Action</th>
                    </tr>
                  </thead>
              <tbody>
                {vulnList.map((v) => (
                  <tr key={v.id} className={v.status === "remediated" ? "opacity-60" : ""}>
                    <td className="p-0 relative">
                      <div className={`priority-bar ${
                        v.severity === "critical" ? "bg-red-600"
                          : v.severity === "high" ? "bg-orange-500"
                          : v.severity === "medium" ? "bg-yellow-500"
                          : "bg-green-500"
                      }`} />
                    </td>
                    <td>
                      <span className="font-mono text-[11px] text-muted-foreground">{v.cveId ?? "—"}</span>
                    </td>
                    <td className="max-w-xs">
                      <span className="block text-foreground">{v.title}</span>
                    </td>
                    <td>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {(v.affectedAssets ?? []).slice(0, 2).join(", ") || "—"}
                        {(v.affectedAssets ?? []).length > 2 && ` +${(v.affectedAssets ?? []).length - 2}`}
                      </span>
                    </td>
                    <td className="text-center">
                      {v.cvssScore ? (
                        <span className={`font-bold text-[12px] ${Number(v.cvssScore) >= 9 ? "text-red-700" : Number(v.cvssScore) >= 7 ? "text-orange-600" : "text-yellow-600"}`}>
                          {v.cvssScore}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td>
                      <span className={`status-badge ${SEVERITY_COLOR[v.severity] ?? "text-muted-foreground bg-muted"}`}>
                        {v.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge capitalize ${VULN_STATE_COLOR[v.status] ?? "text-muted-foreground bg-muted"}`}>
                        {v.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-[11px] text-muted-foreground">
                      {v.discoveredAt ? formatRelativeTime(v.discoveredAt) : "—"}
                    </td>
                    <td>
                      {v.status !== "remediated" && v.status !== "false_positive" && can("vulnerabilities", "write") && (
                        remediatingId === v.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="border border-border rounded px-1.5 py-0.5 text-[10px] w-24"
                              placeholder="Notes…"
                              value={remediateNote}
                              onChange={(e) => setRemediateNote(e.target.value)}
                            />
                            <button
                              onClick={() => remediateVuln.mutate({ id: v.id, notes: remediateNote || undefined })}
                              disabled={remediateVuln.isPending}
                              className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >✓</button>
                            <button onClick={() => setRemediatingId(null)} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setRemediatingId(v.id); setRemediateNote(""); }}
                            className="text-[10px] text-green-600 hover:underline font-medium"
                          >Remediate</button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        )}

        {/* — Security Incidents — */}
        {tab === "incidents" && (
          incidentsLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-caption">Loading incidents…</span>
            </div>
          ) : incidentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Shield className="w-5 h-5 opacity-30" />
              <span className="text-caption">No security incidents. All clear.</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {incidentList.map((inc) => (
                <div key={inc.id} className="px-4 py-3 hover:bg-accent/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-primary">{inc.number}</span>
                        <span className={`status-badge ${SEVERITY_COLOR[inc.severity] ?? "text-muted-foreground bg-muted"}`}>
                          {inc.severity}
                        </span>
                        <span className={`status-badge capitalize ${SEC_INCIDENT_STATE[inc.status] ?? "text-muted-foreground bg-muted"}`}>
                          {inc.status.replace(/_/g, " ")}
                        </span>
                        {inc.attackVector && (
                          <span className="status-badge text-purple-700 bg-purple-100">{inc.attackVector}</span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{inc.title}</p>
                      <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        {inc.mitreTechniques && inc.mitreTechniques.length > 0 && (
                          <span>MITRE ATT&amp;CK: <span className="font-mono text-foreground/80">{inc.mitreTechniques[0]}</span></span>
                        )}
                        {inc.iocs && inc.iocs.length > 0 && (
                          <span>{inc.iocs.length} IOC{inc.iocs.length !== 1 ? "s" : ""}</span>
                        )}
                        <span>Opened {formatRelativeTime(inc.createdAt)}</span>
                        {inc.affectedSystems && inc.affectedSystems.length > 0 && (
                          <span>{inc.affectedSystems.length} affected system{inc.affectedSystems.length !== 1 ? "s" : ""}: {inc.affectedSystems.slice(0, 3).join(", ")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setInvestigatingId(investigatingId === inc.id ? null : inc.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:bg-primary/90">
                        {investigatingId === inc.id ? "Close" : "Investigate"} <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {investigatingId === inc.id && (
                    <div className="mt-3 p-3 bg-muted/40 rounded border border-border text-[11px] space-y-2">
                      <div className="font-semibold text-foreground text-[12px]">Incident Investigation Details</div>
                      {inc.description && <p className="text-muted-foreground">{inc.description}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground/70">ID:</span> <span className="font-mono">{inc.id}</span></div>
                        <div><span className="text-muted-foreground/70">Status:</span> <span className="capitalize">{inc.status.replace(/_/g, " ")}</span></div>
                        <div><span className="text-muted-foreground/70">Severity:</span> <span className="capitalize">{inc.severity}</span></div>
                        {inc.attackVector && <div><span className="text-muted-foreground/70">Attack Vector:</span> {inc.attackVector}</div>}
                        {inc.affectedSystems && inc.affectedSystems.length > 0 && (
                          <div className="col-span-2"><span className="text-muted-foreground/70">Affected Systems:</span> {inc.affectedSystems.join(", ")}</div>
                        )}
                        {inc.mitreTechniques && inc.mitreTechniques.length > 0 && (
                          <div className="col-span-2"><span className="text-muted-foreground/70">MITRE ATT&CK:</span> {inc.mitreTechniques.join(", ")}</div>
                        )}
                        {inc.iocs && inc.iocs.length > 0 && (
                          <div className="col-span-2"><span className="text-muted-foreground/70">IOCs:</span> {inc.iocs.join(", ")}</div>
                        )}
                      </div>
                      {can("security", "write") && (SEC_INCIDENT_TRANSITIONS[inc.status] ?? []).length > 0 && (
                        <div className="flex gap-2 pt-1">
                          {(SEC_INCIDENT_TRANSITIONS[inc.status] ?? []).map((next) => (
                            <button
                              key={next}
                              onClick={() => transitionIncident.mutate({ id: inc.id, toStatus: next as any })}
                              disabled={transitionIncident.isPending}
                              className="text-[10px] px-2 py-1 border border-border rounded hover:bg-accent disabled:opacity-50"
                            >{SEC_TRANSITION_LABEL[next] ?? next}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* — Threat Intelligence — */}
        {tab === "threat_intel" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">Threat Intelligence Feeds</div>
              <button className="text-[11px] text-primary hover:underline" onClick={() => setShowNewThreatIntel(true)}>+ Add to Incident</button>
            </div>
            {threatIntelLoading ? (
              <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-caption">Loading threat intelligence…</span>
              </div>
            ) : threatIntelList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <Shield className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">No threat intelligence data</p>
                <p className="text-[11px] text-muted-foreground/60">Connect external feeds or add Threat Intelligence directly to Security Incidents.</p>
              </div>
            ) : (
              <div className="border border-border rounded overflow-hidden">
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Threat ID</th>
                      <th>Description</th>
                      <th>Incident Link</th>
                      <th>Document</th>
                      <th>Date Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threatIntelList.map((ti) => (
                      <tr key={ti.id}>
                        <td className="font-medium text-[11px]">{ti.number}</td>
                        <td className="max-w-[300px]">{ti.description || "—"}</td>
                        <td>
                          <Link href={`/app/security/${ti.incidentId}`} className="text-primary hover:underline">
                            View Incident
                          </Link>
                        </td>
                        <td>
                          {ti.documentUri ? (
                            <a href={ti.documentUri} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                              <FileText className="w-3.5 h-3.5" /> Document
                            </a>
                          ) : "—"}
                        </td>
                        <td>{new Date(ti.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* — Config Compliance (live from GRC) — */}
        {tab === "compliance" && (
          auditsLoading || policiesLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-caption">Loading compliance data…</span>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Overall posture KPIs */}
              {(() => {
                const auditList: any[] = (grcAudits as any[]) ?? [];
                const policyList: any[] = (grcPolicies as any[]) ?? [];
                const riskList: any[] = (grcRisks as any[]) ?? [];
                const completedAudits = auditList.filter((a) => a.status === "completed" && a.score != null);
                const avgScore = completedAudits.length > 0
                  ? Math.round(completedAudits.reduce((s, a) => s + Number(a.score), 0) / completedAudits.length)
                  : null;
                const publishedPolicies = policyList.filter((p) => p.status === "published").length;
                const openHighRisks = riskList.filter((r) => (r.severity === "critical" || r.severity === "high") && r.status !== "closed" && r.status !== "accepted").length;
                const inProgressAudits = auditList.filter((a) => a.status === "in_progress").length;

                return (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className={`border rounded px-3 py-2 ${avgScore !== null ? (avgScore >= 80 ? "border-green-200 bg-green-50/30" : avgScore >= 60 ? "border-yellow-200 bg-yellow-50/30" : "border-red-200 bg-red-50/30") : "border-border"}`}>
                        <div className={`text-h3 font-black ${avgScore !== null ? (avgScore >= 80 ? "text-green-700" : avgScore >= 60 ? "text-yellow-700" : "text-red-700") : "text-muted-foreground/40"}`}>{avgScore !== null ? `${avgScore}%` : "—"}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Overall Posture</div>
                      </div>
                      <div className="border border-border rounded px-3 py-2">
                        <div className={`text-h3 font-black ${openHighRisks > 0 ? "text-red-700" : "text-green-700"}`}>{openHighRisks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Critical/High Risks</div>
                      </div>
                      <div className="border border-border rounded px-3 py-2">
                        <div className="text-h3 font-black text-blue-700">{publishedPolicies}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Published Policies</div>
                      </div>
                      <div className="border border-border rounded px-3 py-2">
                        <div className={`text-h3 font-black ${inProgressAudits > 0 ? "text-orange-700" : "text-muted-foreground/40"}`}>{inProgressAudits}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Audits In Progress</div>
                      </div>
                    </div>

                    {/* Framework Audit Scores */}
                    <div className="border border-border rounded overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Framework Audit Plans ({auditList.length})
                      </div>
                      {auditList.length === 0 ? (
                        <div className="p-4 text-center text-[11px] text-muted-foreground/50">
                          No audit plans found. Create them in the <a href="/app/compliance" className="text-primary hover:underline">GRC / Compliance module</a>.
                        </div>
                      ) : (
                        <table className="ent-table w-full">
                          <thead>
                            <tr>
                              <th>Audit Name</th>
                              <th>Framework</th>
                              <th>Scope</th>
                              <th>Status</th>
                              <th className="text-center">Score</th>
                              <th>Findings</th>
                              <th>Period</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditList.map((a: any) => {
                              const findings = a.findings ?? [];
                              const openFindings = findings.filter((f: any) => f.status !== "closed" && f.status !== "resolved").length;
                              const score = a.score != null ? Number(a.score) : null;
                              return (
                                <tr key={a.id}>
                                  <td className="font-medium text-foreground max-w-xs">
                                    <span className="block">{a.title ?? a.name}</span>
                                  </td>
                                  <td>
                                    {a.framework ? (
                                      <span className="status-badge text-purple-700 bg-purple-100 text-[10px]">{a.framework}</span>
                                    ) : <span className="text-muted-foreground/50">—</span>}
                                  </td>
                                  <td className="text-[11px] text-muted-foreground max-w-[120px]">
                                    <span className="block">{a.scope ?? "—"}</span>
                                  </td>
                                  <td>
                                    <span className={`status-badge capitalize text-[10px] ${
                                      a.status === "completed" ? "text-green-700 bg-green-100" :
                                      a.status === "in_progress" ? "text-blue-700 bg-blue-100" :
                                      a.status === "cancelled" ? "text-red-700 bg-red-100" :
                                      "text-slate-700 bg-slate-100"
                                    }`}>{a.status?.replace("_", " ")}</span>
                                  </td>
                                  <td className="text-center">
                                    {score !== null ? (
                                      <span className={`font-bold text-[13px] ${score >= 80 ? "text-green-700" : score >= 60 ? "text-yellow-700" : "text-red-700"}`}>
                                        {score}%
                                      </span>
                                    ) : <span className="text-muted-foreground/40">—</span>}
                                  </td>
                                  <td>
                                    {findings.length > 0 ? (
                                      <span className={`text-[11px] font-medium ${openFindings > 0 ? "text-orange-700" : "text-green-700"}`}>
                                        {openFindings > 0 ? `${openFindings} open` : "All closed"} / {findings.length}
                                      </span>
                                    ) : <span className="text-[11px] text-muted-foreground/40">—</span>}
                                  </td>
                                  <td className="text-[11px] text-muted-foreground">
                                    {a.startDate ? new Date(a.startDate).toLocaleDateString() : "—"}
                                    {a.endDate ? ` → ${new Date(a.endDate).toLocaleDateString()}` : ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Published Policies */}
                    <div className="border border-border rounded overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Security Policies ({policyList.length})
                      </div>
                      {policyList.length === 0 ? (
                        <div className="p-4 text-center text-[11px] text-muted-foreground/50">
                          No policies found. Create them in the <a href="/app/grc" className="text-primary hover:underline">GRC module</a>.
                        </div>
                      ) : (
                        <table className="ent-table w-full">
                          <thead>
                            <tr><th>Policy</th><th>Category</th><th>Status</th><th>Last Updated</th></tr>
                          </thead>
                          <tbody>
                            {policyList.map((p: any) => (
                              <tr key={p.id}>
                                <td className="font-medium text-foreground">{p.title ?? p.name}</td>
                                <td className="text-[11px] text-muted-foreground">{p.category ?? "—"}</td>
                                <td>
                                  <span className={`status-badge capitalize text-[10px] ${
                                    p.status === "published" ? "text-green-700 bg-green-100" :
                                    p.status === "draft" ? "text-slate-700 bg-slate-100" :
                                    p.status === "review" ? "text-yellow-700 bg-yellow-100" :
                                    "text-muted-foreground bg-muted"
                                  }`}>{p.status}</span>
                                </td>
                                <td className="text-[11px] text-muted-foreground">
                                  {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Open High/Critical Risks */}
                    {riskList.filter((r: any) => (r.severity === "critical" || r.severity === "high") && r.status !== "closed" && r.status !== "accepted").length > 0 && (
                      <div className="border border-red-200 rounded overflow-hidden">
                        <div className="px-3 py-2 bg-red-50/40 border-b border-red-200 text-[11px] font-semibold text-red-700 uppercase tracking-wide">
                          Open Critical / High Risks
                        </div>
                        <table className="ent-table w-full">
                          <thead>
                            <tr><th>Risk</th><th>Severity</th><th>Category</th><th>Status</th><th>Owner</th></tr>
                          </thead>
                          <tbody>
                            {riskList.filter((r: any) => (r.severity === "critical" || r.severity === "high") && r.status !== "closed" && r.status !== "accepted").map((r: any) => (
                              <tr key={r.id}>
                                <td className="font-medium text-foreground max-w-xs"><span className="block">{r.title}</span></td>
                                <td><span className={`status-badge capitalize text-[10px] ${r.severity === "critical" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>{r.severity}</span></td>
                                <td className="text-[11px] text-muted-foreground">{r.category ?? "—"}</td>
                                <td><span className="status-badge capitalize text-[10px] text-blue-700 bg-blue-100">{r.status?.replace("_", " ")}</span></td>
                                <td className="text-[11px] text-muted-foreground">{r.owner ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )
        )}
      </div>

      {/* New Security Incident Modal */}
      {showNewIncident && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-body-sm font-semibold text-red-700 flex items-center gap-2"><Shield className="w-4 h-4" /> New Security Incident</h2>
              <button onClick={() => setShowNewIncident(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Title <span className="text-red-500">*</span></label>
              <input value={incForm.title} onChange={(e) => setIncForm(f => ({...f, title: e.target.value}))} placeholder="Brief description of the incident…" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-destructive" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Description</label>
              <textarea rows={3} value={incForm.description} onChange={(e) => setIncForm(f => ({...f, description: e.target.value}))} placeholder="What happened, affected systems, initial indicators…" className="px-3 py-2 text-body-sm border border-border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-destructive" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <label className="text-caption font-medium">Severity</label>
                <select value={incForm.severity} onChange={(e) => setIncForm(f => ({...f, severity: e.target.value as any}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none">
                  {["critical","high","medium","low","informational"].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-caption font-medium">Attack Vector</label>
                <input value={incForm.attackVector} onChange={(e) => setIncForm(f => ({...f, attackVector: e.target.value}))} placeholder="e.g. phishing, RCE…" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewIncident(false)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!incForm.title.trim()) { toast.error("Title is required"); return; } createIncident.mutate({ title: incForm.title.trim(), description: incForm.description || undefined, severity: incForm.severity, attackVector: incForm.attackVector || undefined }); }}
                disabled={createIncident.isPending}
                className="px-4 py-1.5 text-caption bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50">
                {createIncident.isPending ? "Creating…" : "Declare Incident"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* New Threat Intel Modal */}
      {showNewThreatIntel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-body-sm font-semibold text-primary flex items-center gap-2"><Shield className="w-4 h-4" /> New Threat Intelligence</h2>
              <button onClick={() => setShowNewThreatIntel(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Link to Incident <span className="text-red-500">*</span></label>
              <select value={tiForm.incidentId} onChange={(e) => setTiForm(f => ({...f, incidentId: e.target.value}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Select an active incident…</option>
                {incidentList.filter(inc => inc.status !== "closed" && inc.status !== "false_positive").map(inc => (
                  <option key={inc.id} value={inc.id}>{inc.number || `INC-${inc.id.slice(0, 8)}`} - {inc.title}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Description <span className="text-red-500">*</span></label>
              <textarea rows={3} value={tiForm.description} onChange={(e) => setTiForm(f => ({...f, description: e.target.value}))} placeholder="E.g., Suspected phishing domain, malicious IP..." className="px-3 py-2 text-body-sm border border-border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Document URL</label>
              <input type="url" value={tiForm.documentUri} onChange={(e) => setTiForm(f => ({...f, documentUri: e.target.value}))} placeholder="https://example.com/report.pdf" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewThreatIntel(false)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!tiForm.incidentId || !tiForm.description.trim()) { toast.error("Incident and Description are required"); return; } createThreatIntel.mutate({ incidentId: tiForm.incidentId, description: tiForm.description.trim(), documentUri: tiForm.documentUri || undefined }); }}
                disabled={createThreatIntel.isPending}
                className="px-4 py-1.5 text-caption bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                {createThreatIntel.isPending ? "Saving…" : "Save Threat Intel"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* New Vulnerability Modal */}
      {showNewVulnerability && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-body-sm font-semibold text-primary flex items-center gap-2"><Shield className="w-4 h-4" /> Add Vulnerability</h2>
              <button onClick={() => setShowNewVulnerability(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Link to Incident</label>
              <select value={vulnForm.incidentId} onChange={(e) => setVulnForm(f => ({...f, incidentId: e.target.value}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">No incident linked</option>
                {incidentList.filter(inc => inc.status !== "closed" && inc.status !== "false_positive").map(inc => (
                  <option key={inc.id} value={inc.id}>{inc.number || `INC-${inc.id.slice(0, 8)}`} - {inc.title}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">CVE ID</label>
              <input value={vulnForm.cveId} onChange={(e) => setVulnForm(f => ({...f, cveId: e.target.value}))} placeholder="CVE-2026-..." className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Title / Description <span className="text-red-500">*</span></label>
              <input value={vulnForm.title} onChange={(e) => setVulnForm(f => ({...f, title: e.target.value}))} placeholder="Brief title..." className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-caption font-medium">Severity</label>
              <select value={vulnForm.severity} onChange={(e) => setVulnForm(f => ({...f, severity: e.target.value as any}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                {["critical","high","medium","low","none"].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewVulnerability(false)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!vulnForm.title.trim()) { toast.error("Title is required"); return; } createVulnerability.mutate({ incidentId: vulnForm.incidentId || undefined, title: vulnForm.title.trim(), cveId: vulnForm.cveId || undefined, severity: vulnForm.severity as any }); }}
                disabled={createVulnerability.isPending}
                className="px-4 py-1.5 text-caption bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                {createVulnerability.isPending ? "Saving…" : "Add Vulnerability"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
