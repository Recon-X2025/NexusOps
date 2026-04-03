"use client";

import Link from "next/link";
import {
  Target, FolderOpen, Layers, BarChart2, AlertTriangle, Calendar,
  ChevronRight, CheckCircle2, Loader2,
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
    label: "Project Portfolio",      href: "/app/projects", icon: FolderOpen,  color: "text-blue-600 bg-blue-50",
    description: "Project intake, resource planning, milestone tracking, Gantt timelines, status reports.",
  },
  {
    label: "Application Portfolio",  href: "/app/apm",      icon: Layers,      color: "text-purple-600 bg-purple-50",
    description: "Application rationalization, lifecycle management, tech debt tracking, architecture views.",
  },
  {
    label: "Analytics & Reporting",  href: "/app/reports",  icon: BarChart2,   color: "text-indigo-600 bg-indigo-50",
    description: "Executive dashboards, SLA analytics, capacity reports, custom report builder.",
  },
];

const STATUS_COLOR: Record<string, string> = {
  on_track:  "text-green-700 bg-green-100",
  at_risk:   "text-orange-700 bg-orange-100",
  delayed:   "text-red-700 bg-red-100",
  planning:  "text-blue-700 bg-blue-100",
  completed: "text-muted-foreground bg-muted",
  cancelled: "text-muted-foreground bg-muted",
};

export default function StrategyProjectsDashboard() {
  const { can } = useRBAC();

  const { data: projects, isLoading: loadingProjects } = trpc.projects.list.useQuery({ limit: 50 });
  const { data: appsPage, isLoading: loadingApps } = trpc.apm.applications.list.useQuery({});

  if (!can("projects", "read") && !can("demand", "read") && !can("analytics", "read")) {
    return <AccessDenied module="Strategy & Projects" />;
  }

  const apps = appsPage?.items ?? [];

  const activeProjects = projects ? projects.filter((p) => p.status !== "completed" && p.status !== "cancelled").length : 0;
  const atRiskProjects = projects ? projects.filter((p) => p.status === "at_risk" || p.status === "delayed").length : 0;

  const avgBudgetUsed = projects && projects.length > 0
    ? Math.round(
        projects
          .filter((p) => p.budgetTotal && parseFloat(String(p.budgetTotal)) > 0)
          .reduce((sum, p) => {
            const total = parseFloat(String(p.budgetTotal ?? "0"));
            const spent = parseFloat(String(p.budgetSpent ?? "0"));
            return sum + (total > 0 ? (spent / total) * 100 : 0);
          }, 0) / Math.max(projects.filter((p) => p.budgetTotal && parseFloat(String(p.budgetTotal)) > 0).length, 1)
      )
    : 0;

  const alerts = [
    atRiskProjects > 0
      ? { color: "bg-red-500",    text: `${atRiskProjects} project${atRiskProjects !== 1 ? "s" : ""} at risk or delayed` }
      : null,
    apps && apps.length > 0
      ? { color: "bg-yellow-400", text: `${apps.filter((a) => a.lifecycle === "retire" || a.lifecycle === "decommission").length} applications flagged for retirement` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Active",   v: loadingProjects ? "…" : String(activeProjects) },
      { k: "At Risk",  v: loadingProjects ? "…" : String(atRiskProjects) },
    ],
    [
      { k: "Apps",     v: loadingApps ? "…" : String(apps?.length ?? 0) },
    ],
    [
      { k: "Reports",  v: "—" },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
            <Target className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Strategy & Projects</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Strategy & Projects Dashboard</h1>
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
        <KPICard label="Active Projects" value={activeProjects} color="text-blue-700" icon={FolderOpen} href="/app/projects" isLoading={loadingProjects} />
        <KPICard label="Projects at Risk" value={atRiskProjects} color="text-red-700" icon={AlertTriangle} href="/app/projects" isLoading={loadingProjects} />
        <KPICard label="Avg Budget Utilized" value={`${avgBudgetUsed}%`} color="text-orange-700" icon={CheckCircle2} href="/app/projects" isLoading={loadingProjects} />
        <KPICard label="Total Projects" value={projects?.length ?? 0} color="text-green-700" icon={Target} href="/app/projects" isLoading={loadingProjects} />
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
        {/* Project Portfolio */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Project Portfolio</span>
            </div>
            <Link href="/app/projects" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingProjects ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>Number</th><th>Project</th><th>Budget</th><th>Status</th></tr></thead>
              <tbody>
                {(projects ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-4 text-[12px]">No projects found</td></tr>
                ) : (projects ?? []).slice(0, 6).map((p) => {
                  const budgetTotal = parseFloat(String(p.budgetTotal ?? "0"));
                  const budgetSpent = parseFloat(String(p.budgetSpent ?? "0"));
                  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;
                  return (
                    <tr key={p.id}>
                      <td className="font-mono text-[11px] text-primary">{p.number}</td>
                      <td className="max-w-[160px]"><span className="truncate block text-foreground">{p.name}</span></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <div className="w-10 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${budgetPct >= 85 ? "bg-red-500" : budgetPct >= 70 ? "bg-yellow-400" : "bg-green-500"}`} style={{ width: `${budgetPct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{budgetPct}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge text-[10px] capitalize ${STATUS_COLOR[p.status] ?? "text-muted-foreground bg-muted"}`}>
                          {p.status?.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Applications */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Application Portfolio</span>
            </div>
            <Link href="/app/apm" className="text-[11px] text-primary hover:underline">APM →</Link>
          </div>
          {loadingApps ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>App</th><th>Lifecycle</th><th>Cloud Ready</th></tr></thead>
              <tbody>
                {(apps ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-muted-foreground py-4 text-[12px]">No applications found</td></tr>
                ) : (apps ?? []).slice(0, 6).map((a) => (
                  <tr key={a.id}>
                    <td className="max-w-[160px]"><span className="truncate block text-foreground">{a.name}</span></td>
                    <td>
                      <span className={`status-badge capitalize text-[10px] ${a.lifecycle === "retire" || a.lifecycle === "decommission" ? "text-red-700 bg-red-100" : a.lifecycle === "active" || a.lifecycle === "maintain" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                        {a.lifecycle?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge capitalize text-[10px] ${a.cloudReadiness === "cloud_native" || a.cloudReadiness === "cloud_ready" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                        {a.cloudReadiness?.replace(/_/g, " ") ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
