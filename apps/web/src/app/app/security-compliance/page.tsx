"use client";

import Link from "next/link";
import {
  ShieldCheck, Shield, Target, CheckCircle2, AlertTriangle,
  ChevronRight, Eye, Lock, FileWarning, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

function KPICard({ label, value, color, href, icon: Icon, isLoading }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean;
}) {
  const content = (
    <div className="bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    label: "Security Operations",    href: "/app/security",  icon: Shield,       color: "text-red-600 bg-red-50",
    description: "Threat detection, vulnerability management, security incident response.",
  },
  {
    label: "Risk & Compliance (GRC)", href: "/app/grc",      icon: Target,       color: "text-blue-600 bg-blue-50",
    description: "Risk registry, audit management, policy governance, compliance tracking.",
  },
  {
    label: "Approvals & Workflow",   href: "/app/approvals", icon: CheckCircle2, color: "text-green-600 bg-green-50",
    description: "Multi-stage approvals, delegation, escalation, flow automation.",
  },
];

export default function SecurityComplianceDashboard() {
  const { can } = useRBAC();
  if (!can("security", "read") && !can("grc", "read")) {
    return <AccessDenied module="Security & Compliance" />;
  }

  const { data: secStatusCounts, isLoading: loadingSec } = trpc.security.statusCounts.useQuery();
  const { data: openIncidentCount, isLoading: loadingSecCount } = trpc.security.openIncidentCount.useQuery();
  const { data: vulns, isLoading: loadingVulns } = trpc.security.listVulnerabilities.useQuery({ limit: 5 });
  const { data: risks, isLoading: loadingRisks } = trpc.grc.listRisks.useQuery({});
  const { data: audits, isLoading: loadingAudits } = trpc.grc.listAudits.useQuery();
  const { data: pendingApprovals, isLoading: loadingApprovals } = trpc.approvals.myPending.useQuery();

  const criticalVulns = secStatusCounts ? (secStatusCounts["critical"] ?? 0) : 0;
  const highVulns = secStatusCounts ? (secStatusCounts["high"] ?? 0) : 0;
  const openRisks = risks ? risks.filter((r) => r.status !== "closed" && r.status !== "accepted").length : 0;

  const alerts = [
    criticalVulns > 0 ? { color: "bg-red-500", text: `${criticalVulns} critical vulnerabilit${criticalVulns !== 1 ? "ies" : "y"} require immediate remediation` } : null,
    openRisks > 0 ? { color: "bg-orange-500", text: `${openRisks} open risk item${openRisks !== 1 ? "s" : ""} require attention in GRC` } : null,
    audits && audits.length > 0 ? { color: "bg-blue-500", text: `${audits.length} audit plan${audits.length !== 1 ? "s" : ""} active in the system` } : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Open",      v: loadingSecCount ? "…" : String(openIncidentCount ?? 0) },
      { k: "Critical",  v: loadingSec ? "…" : String(criticalVulns) },
      { k: "High",      v: loadingSec ? "…" : String(highVulns) },
    ],
    [
      { k: "Risks",       v: loadingRisks   ? "…" : String(risks?.length ?? 0) },
      { k: "Audits Open", v: loadingAudits  ? "…" : String(audits?.length ?? 0) },
    ],
    [
      { k: "Pending",   v: loadingApprovals ? "…" : String(pendingApprovals?.length ?? 0) },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Security & Compliance</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Security & Compliance Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">3 modules · live data</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded text-[11px] text-foreground/80">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.color}`} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <KPICard label="Critical Vulnerabilities" value={criticalVulns} color="text-red-700" icon={AlertTriangle} href="/app/security" isLoading={loadingSec} />
        <KPICard label="Open Security Incidents" value={openIncidentCount ?? 0} color="text-orange-700" icon={Shield} href="/app/security" isLoading={loadingSecCount} />
        <KPICard label="Open Risk Items" value={openRisks} color="text-yellow-700" icon={FileWarning} href="/app/grc" isLoading={loadingRisks} />
        <KPICard label="Pending Approvals" value={pendingApprovals?.length ?? 0} color="text-blue-700" icon={CheckCircle2} href="/app/approvals" isLoading={loadingApprovals} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MODULES.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Link key={m.label} href={m.href}
              className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all group flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
              </div>
              <div className="flex gap-3 mt-auto pt-1 border-t border-border">
                {moduleStats[idx]?.map((s) => (
                  <div key={s.k} className="text-center">
                    <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Vulnerability Feed */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Active Vulnerabilities</span>
            </div>
            <Link href="/app/security" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingVulns ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>CVE / ID</th><th>Title</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                {(vulns ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-4 text-[12px]">No vulnerabilities found</td></tr>
                ) : (vulns ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono text-[11px] text-primary">{v.cveId ?? v.id.slice(0, 8)}</td>
                    <td className="max-w-[180px]"><span className="truncate block text-foreground">{v.title}</span></td>
                    <td>
                      <span className={`status-badge capitalize ${v.severity === "critical" ? "text-red-700 bg-red-100" : v.severity === "high" ? "text-orange-700 bg-orange-100" : "text-yellow-700 bg-yellow-100"}`}>
                        {v.severity}
                      </span>
                    </td>
                    <td>
                      <span className="status-badge capitalize text-muted-foreground bg-muted">{v.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit / Compliance posture */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Audit Plans</span>
            </div>
            <Link href="/app/grc" className="text-[11px] text-primary hover:underline">GRC →</Link>
          </div>
          {loadingAudits ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(audits ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-[12px]">No audit plans found</div>
              ) : (audits ?? []).slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">{a.title}</div>
                    {a.startDate && (
                      <div className="text-[10px] text-muted-foreground/70">
                        Started: {new Date(a.startDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <span className={`status-badge text-[10px] ${a.status === "completed" ? "text-green-700 bg-green-100" : a.status === "in_progress" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>
                    {a.status?.replace(/_/g, " ") ?? "Planned"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
