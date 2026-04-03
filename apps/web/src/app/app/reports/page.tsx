"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart2, TrendingUp, TrendingDown, Shield, Clock, Users, Activity, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const REPORT_TABS = [
  { key: "overview",  label: "Executive Overview",  module: "reports"   as const, action: "read" as const },
  { key: "sla",       label: "SLA Performance",     module: "reports"   as const, action: "read" as const },
  { key: "workload",  label: "Workload Analysis",   module: "reports"   as const, action: "read" as const },
  { key: "trends",    label: "Trend Analysis",      module: "analytics" as const, action: "read" as const },
  { key: "quality",   label: "Quality Metrics",     module: "reports"   as const, action: "read" as const },
];

const MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground w-6 text-right">{value}</span>
    </div>
  );
}

function SkeletonSection() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-border rounded p-3 space-y-2">
            <div className="h-6 bg-muted rounded" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { can } = useRBAC();
  const visibleTabs = REPORT_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "overview");
  const [dateRange, setDateRange] = useState("30");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  const { data: metrics } = trpc.dashboard.getMetrics.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // @ts-ignore
  const execQuery = trpc.reports.executiveOverview.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // @ts-ignore
  const slaQuery = trpc.reports.slaDashboard.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // @ts-ignore
  const workloadQuery = trpc.reports.workloadAnalysis.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  // @ts-ignore
  const trendQuery = trpc.reports.trendAnalysis.useQuery({ days: Number(dateRange) }, { staleTime: 5 * 60 * 1000 });

  if (!can("reports", "read") && !can("analytics", "read")) return <AccessDenied module="Analytics & Reporting" />;

  const incidentTrend: number[] = execQuery.data?.incidentTrend ?? [];
  const resolvedTrend: number[] = execQuery.data?.resolvedTrend ?? [];
  const slaTrend: number[] = slaQuery.data?.slaTrend ?? [];
  const byCategory: any[] = execQuery.data?.byCategory ?? [];
  const byAssignee: any[] = workloadQuery.data?.byAssignee ?? [];
  const slaByPriority: any[] = slaQuery.data?.byPriority ?? [];
  const backlogTrend: any[] = trendQuery.data?.backlogTrend ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Performance Analytics</h1>
          <span className="text-[11px] text-muted-foreground/70">Reports · SLA Dashboard · Workload Analysis · Trends</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-2 py-1 text-[11px] border border-border rounded bg-card text-foreground/80"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">This fiscal year</option>
          </select>
          <button onClick={() => { window.print(); }} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Download className="w-3 h-3" /> Export PDF
          </button>
        </div>
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

      <div className="bg-card border border-border rounded-b p-4">
        {tab === "overview" && (
          execQuery.isLoading ? <SkeletonSection /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-3">
              {[
                { label: "Open Incidents",     value: metrics?.openTickets ?? execQuery.data?.openIncidents ?? "—",  delta: -8, color: "text-blue-700",   icon: AlertTriangle },
                { label: "Resolved MTD",        value: metrics?.resolvedToday ?? execQuery.data?.resolvedMtd ?? "—", delta: +12, color: "text-green-700", icon: CheckCircle2 },
                { label: "SLA Compliance",      value: execQuery.data?.slaCompliance ?? (slaQuery.data ? `${Math.round((1 - (slaQuery.data as any[]).reduce((s: number, x: any) => s + (Number(x.breached ?? 0)), 0) / Math.max((slaQuery.data as any[]).reduce((s: number, x: any) => s + (Number(x.total ?? 0)), 0), 1)) * 100)}%` : "—"), delta: +2, color: "text-green-700",  icon: Shield },
                { label: "Avg Resolution Time", value: execQuery.data?.avgResolutionTime ?? "—", delta: -0.8, color: "text-blue-700", icon: Clock },
                { label: "CSAT Score",          value: execQuery.data?.csatScore ?? "—", delta: +0.1, color: "text-green-700", icon: Users },
                { label: "Ticket Deflection",   value: execQuery.data?.ticketDeflection ?? "—", delta: +5,  color: "text-purple-700", icon: Activity },
              ].map((k) => {
                const Icon = k.icon;
                return (
                  <div key={k.label} className="border border-border rounded p-3">
                    <div className="flex items-start justify-between">
                      <Icon className="w-4 h-4 text-muted-foreground/70" />
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${k.delta > 0 ? "text-green-600" : "text-red-600"}`}>
                        {k.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(k.delta)}
                      </span>
                    </div>
                    <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{k.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded p-3">
                <div className="text-[11px] font-semibold text-muted-foreground mb-3">Incident Volume vs Resolved — 6 Month Trend</div>
                <div className="flex items-end gap-2 h-24">
                  {MONTHS.map((m, i) => {
                    const incN = incidentTrend[i] ?? 0;
                    const resN = resolvedTrend[i] ?? 0;
                    return (
                    <div key={m} className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex items-end gap-0.5 flex-1 w-full">
                        <div className="flex-1 bg-red-400 rounded-t" style={{ height: `${(incN / 160) * 100}%` }} title={`${incN} incidents`} />
                        <div className="flex-1 bg-green-400 rounded-t" style={{ height: `${(resN / 160) * 100}%` }} title={`${resN} resolved`} />
                      </div>
                      <span className="text-[10px] text-muted-foreground/70">{m}</span>
                    </div>
                  );})}
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded" /> Created</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded" /> Resolved</span>
                </div>
              </div>

              <div className="border border-border rounded p-3">
                <div className="text-[11px] font-semibold text-muted-foreground mb-3">Incidents by Category — This Month</div>
                <div className="space-y-1.5">
                  {byCategory.map((c: any) => (
                    <div key={c.cat ?? c.category} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-28 flex-shrink-0">{c.cat ?? c.category}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${c.pct ?? c.percent ?? 0}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground w-8 text-right">{c.count}</span>
                      <span className="text-[10px] text-muted-foreground/70 w-8">{c.pct ?? c.percent ?? 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )
        )}

        {tab === "sla" && (
          slaQuery.isLoading ? <SkeletonSection /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {slaByPriority.map((row: any) => (
                <div key={row.priority} className="border border-border rounded p-3">
                  <div className="text-[11px] font-semibold text-foreground/80 mb-1">{row.priority}</div>
                  <div className="text-[11px] text-muted-foreground mb-2">Target: Resolve &lt; {row.target}</div>
                  <div className={`text-3xl font-bold ${row.mtd >= 90 ? "text-green-700" : row.mtd >= 75 ? "text-yellow-600" : "text-red-600"}`}>{row.mtd}%</div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
                    <div className={`h-full rounded-full ${row.mtd >= 90 ? "bg-green-500" : row.mtd >= 75 ? "bg-yellow-400" : "bg-red-500"}`}
                      style={{ width: `${row.mtd}%` }} />
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    {row.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
                    vs {row.prev}% last month
                  </div>
                </div>
              ))}
            </div>

            <div className="border border-border rounded p-3">
              <div className="text-[11px] font-semibold text-muted-foreground mb-3">SLA Compliance Trend — 6 Months</div>
              <div className="flex items-end gap-4 h-20">
                {MONTHS.map((m, i) => {
                  const sla = slaTrend[i] ?? 0;
                  return (
                  <div key={m} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t" style={{ height: `${sla}%`, background: `hsl(${120 * (sla / 100)}, 60%, 45%)` }} />
                    <span className="text-[10px] text-muted-foreground">{sla}%</span>
                    <span className="text-[10px] text-muted-foreground/70">{m}</span>
                  </div>
                );})}
              </div>
            </div>
          </div>
          )
        )}

        {tab === "workload" && (
          workloadQuery.isLoading ? <SkeletonSection /> : (
          <div className="space-y-4">
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Assignee</th>
                  <th className="text-center">Open</th>
                  <th className="text-center">Resolved MTD</th>
                  <th>Avg Resolution</th>
                  <th>Open Tickets</th>
                  <th className="text-center">CSAT</th>
                </tr>
              </thead>
              <tbody>
                {byAssignee.map((a: any) => (
                  <tr key={a.name} className={a.name === "Unassigned" ? "bg-red-50/40" : ""}>
                    <td>
                      <div className="flex items-center gap-2">
                        {a.name !== "Unassigned" && (
                          <span className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold">
                            {(a.name ?? "").split(" ").map((n: string) => n[0]).join("")}
                          </span>
                        )}
                        <span className={a.name === "Unassigned" ? "text-red-600 font-semibold" : "text-foreground"}>{a.name}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`font-bold ${a.open > 10 ? "text-red-700" : a.open > 5 ? "text-orange-600" : "text-green-600"}`}>{a.open}</span>
                    </td>
                    <td className="text-center text-green-700 font-semibold">{a.resolved}</td>
                    <td>{a.avgRes !== "—" ? (
                      <span className={`font-mono text-[11px] ${parseFloat(a.avgRes) > 5 ? "text-orange-600" : "text-green-600"}`}>{a.avgRes}</span>
                    ) : "—"}</td>
                    <td className="min-w-32">
                      {a.open > 0 ? <MiniBar value={a.open} max={20} color={a.open > 10 ? "bg-red-500" : "bg-primary"} /> : <span className="text-[11px] text-green-600">Clear</span>}
                    </td>
                    <td className="text-center">
                      {a.csat > 0 ? (
                        <span className={`font-bold text-[12px] ${a.csat >= 4.5 ? "text-green-700" : a.csat >= 4.0 ? "text-yellow-600" : "text-red-600"}`}>{a.csat}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}

        {tab === "trends" && (
          trendQuery.isLoading ? <SkeletonSection /> : (
          <div className="space-y-4">
            <div className="text-[12px] font-semibold text-muted-foreground mb-2">Backlog Trend — 6 Week History</div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="text-center">Total Backlog</th>
                  <th className="text-center">P1 – Critical</th>
                  <th className="text-center">P2 – High</th>
                  <th className="text-center">P3 – Moderate</th>
                  <th className="text-center">P4 – Low</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {backlogTrend.map((row: any, i: number) => (
                  <tr key={row.week}>
                    <td className="font-mono text-[11px] text-muted-foreground">{row.week}</td>
                    <td className="text-center font-bold text-foreground">{row.total}</td>
                    <td className="text-center text-red-700 font-bold">{row.p1}</td>
                    <td className="text-center text-orange-600 font-semibold">{row.p2}</td>
                    <td className="text-center text-yellow-600">{row.p3}</td>
                    <td className="text-center text-green-600">{row.p4}</td>
                    <td>
                      {i > 0 && (() => {
                        const prev = backlogTrend[i - 1];
                        if (!prev) return null;
                        return (
                        <span className={`flex items-center gap-0.5 text-[11px] font-medium ${row.total < prev.total ? "text-green-600" : "text-red-600"}`}>
                          {row.total < prev.total ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                          {Math.abs(row.total - prev.total)}
                        </span>
                      );})()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}

        {tab === "quality" && (
          <div className="space-y-4">
            {slaQuery.isLoading ? <SkeletonSection /> : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const slaData: any[] = slaQuery.data ?? [];
                    const totalTickets = slaData.reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);
                    const totalBreached = slaData.reduce((s: number, x: any) => s + Number(x.breached ?? 0), 0);
                    const slaBreachRate = totalTickets > 0 ? ((totalBreached / totalTickets) * 100).toFixed(1) : null;
                    const slaCompliance = totalTickets > 0 ? (((totalTickets - totalBreached) / totalTickets) * 100).toFixed(1) : null;
                    const openTickets = metrics?.openTickets ?? execQuery.data?.openIncidents ?? 0;
                    const metrics2: Array<{ title: string; value: string; target: string; met: boolean; live: boolean }> = [
                      { title: "SLA Breach Rate",        value: slaBreachRate ? `${slaBreachRate}%` : "—", target: "<10%", met: slaBreachRate ? Number(slaBreachRate) < 10 : true, live: true },
                      { title: "SLA Compliance Rate",    value: slaCompliance ? `${slaCompliance}%` : "—", target: "≥90%", met: slaCompliance ? Number(slaCompliance) >= 90 : false, live: true },
                      { title: "Open Incidents",         value: String(openTickets), target: "< Threshold", met: Number(openTickets) < 50, live: true },
                      { title: "First Contact Resolution Rate", value: execQuery.data?.slaCompliance ? "—" : "—", target: "75%", met: false, live: false },
                      { title: "CSAT Score",             value: execQuery.data?.csatScore ?? "—", target: "≥4.0", met: execQuery.data?.csatScore ? parseFloat(execQuery.data.csatScore as string) >= 4.0 : false, live: !!execQuery.data?.csatScore },
                      { title: "Avg Resolution Time",    value: execQuery.data?.avgResolutionTime ?? "—", target: "< 8h", met: false, live: !!execQuery.data?.avgResolutionTime },
                    ];
                    return metrics2.map((metric) => (
                      <div key={metric.title} className={`border rounded p-3 ${metric.met ? "border-green-200 bg-green-50/30" : "border-yellow-200 bg-yellow-50/30"}`}>
                        <div className="flex items-center gap-1 mb-1">
                          <div className="text-[11px] font-semibold text-muted-foreground">{metric.title}</div>
                          {metric.live && <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-medium">LIVE</span>}
                        </div>
                        <div className={`text-3xl font-bold ${metric.met ? "text-green-700" : metric.value === "—" ? "text-muted-foreground/40" : "text-yellow-600"}`}>{metric.value}</div>
                        <div className="flex items-center gap-2 mt-1 text-[11px]">
                          <span className="text-muted-foreground">Target: {metric.target}</span>
                          {metric.met ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                {slaQuery.data && (slaQuery.data as any[]).length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase">SLA by Priority (Live)</div>
                    <table className="ent-table w-full">
                      <thead><tr><th>Priority</th><th className="text-right">Total</th><th className="text-right">Breached</th><th className="text-right">Breach Rate</th></tr></thead>
                      <tbody>
                        {(slaQuery.data as any[]).map((row: any) => (
                          <tr key={row.priorityId ?? row.priority}>
                            <td className="font-medium">{row.priorityName ?? row.priority ?? row.priorityId ?? "Unknown"}</td>
                            <td className="text-right font-mono text-[11px]">{row.total}</td>
                            <td className="text-right font-mono text-[11px] text-red-600">{row.breached}</td>
                            <td className="text-right font-mono text-[11px]">
                              <span className={`${Number(row.breachRate ?? 0) > 0.1 ? "text-red-600" : "text-green-600"}`}>
                                {row.breachRate != null ? `${(Number(row.breachRate) * 100).toFixed(1)}%` : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
