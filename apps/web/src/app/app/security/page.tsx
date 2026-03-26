"use client";

import { useState, useEffect } from "react";
import {
  Shield, CheckCircle2, Plus, Target, ChevronRight, Loader2,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/utils";

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

export default function SecurityOpsPage() {
  const { can } = useRBAC();
  const visibleTabs = SEC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "vulnerabilities");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("security", "read") && !can("vulnerabilities", "read") && !can("grc", "read")) {
    return <AccessDenied module="Security Operations" />;
  }

  const { data: vulns, isLoading: vulnsLoading } = trpc.security.listVulnerabilities.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );
  const { data: incidents, isLoading: incidentsLoading } = trpc.security.listIncidents.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );

  type VulnItem = NonNullable<typeof vulns>[number];
  type IncidentItem = NonNullable<typeof incidents>["items"][number];
  const vulnList: VulnItem[] = vulns ?? [];
  const incidentList: IncidentItem[] = incidents?.items ?? [];

  const critVulns = vulnList.filter((v) => v.severity === "critical" && v.status !== "resolved").length;
  const overdueVulns = vulnList.filter((v) => {
    if (v.status === "resolved" || !v.discoveredAt) return false;
    const days = Math.floor((Date.now() - new Date(v.discoveredAt).getTime()) / 86400000);
    return days > 14;
  }).length;
  const openSIRs = incidentList.filter((s) => !["closed", "false_positive"].includes(s.status)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-500" />
          <h1 className="text-sm font-semibold text-foreground">Security Operations</h1>
          <span className="text-[11px] text-muted-foreground">Vulnerability Response · SecOps · Threat Intel</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-accent text-muted-foreground">
            <Target className="w-3 h-3" /> Import Scan Results
          </button>
          <button className="flex items-center gap-1 px-3 py-1 bg-destructive text-destructive-foreground text-[11px] rounded hover:bg-destructive/90">
            <Plus className="w-3 h-3" /> New Security Incident
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Critical Vulns Open",  value: critVulns,    color: "text-red-700",    border: "border-red-200 bg-red-50/30" },
          { label: "Overdue Remediation",  value: overdueVulns, color: "text-orange-700", border: "border-orange-200" },
          { label: "Active Sec Incidents", value: openSIRs,     color: "text-purple-700", border: "border-purple-200" },
          { label: "IOCs Blocked",         value: "—",          color: "text-green-700",  border: "border-green-200" },
        ].map((k) => (
          <div key={k.label} className={`bg-card border rounded px-3 py-2 ${k.border}`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
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
          vulnsLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading vulnerabilities…</span>
            </div>
          ) : vulnList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Shield className="w-5 h-5 opacity-30" />
              <span className="text-xs">No vulnerabilities found.</span>
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
                </tr>
              </thead>
              <tbody>
                {vulnList.map((v) => (
                  <tr key={v.id} className={v.status === "resolved" ? "opacity-60" : ""}>
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
                      <span className="truncate block text-foreground">{v.title}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* — Security Incidents — */}
        {tab === "incidents" && (
          incidentsLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading incidents…</span>
            </div>
          ) : incidentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Shield className="w-5 h-5 opacity-30" />
              <span className="text-xs">No security incidents. All clear.</span>
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
                      <button className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:bg-primary/90">
                        Investigate <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* — Threat Intelligence — */}
        {tab === "threat_intel" && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">No threat intelligence feeds connected</p>
            <p className="text-[11px] text-muted-foreground/60">Connect Crowdstrike, VirusTotal, AlienVault OTX or other TI feeds to see IOC data here.</p>
          </div>
        )}

        {/* — Compliance (live from GRC policies) — */}
        {tab === "compliance" && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">No compliance framework scans configured</p>
            <p className="text-[11px] text-muted-foreground/60">Add compliance frameworks (CIS, NIST, PCI-DSS, ISO 27001) in the GRC module to track scores here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
