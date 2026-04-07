"use client";

import Link from "next/link";
import {
  Monitor, TicketIcon, AlertTriangle, CheckCircle2, Wrench, Activity,
  HardDrive, GitBranch, ChevronRight, TrendingDown, TrendingUp,
  Server, Cpu, Package, Radio, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/utils";

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
    label: "Service Desk",          href: "/app/tickets",    icon: TicketIcon,  color: "text-blue-600 bg-blue-50",
    description: "Incident & request management, SLA tracking, queue management.",
  },
  {
    label: "Change & Problem",      href: "/app/changes",    icon: GitBranch,   color: "text-purple-600 bg-purple-50",
    description: "Change advisory, problem records, known-error database.",
  },
  {
    label: "Field Service",         href: "/app/work-orders", icon: Wrench,     color: "text-orange-600 bg-orange-50",
    description: "On-site dispatching, parts inventory, technician scheduling.",
  },
  {
    label: "IT Operations / Events",href: "/app/events",     icon: Activity,    color: "text-red-600 bg-red-50",
    description: "Event correlation, service health map, automated remediation.",
  },
  {
    label: "Hardware Assets (HAM)", href: "/app/ham",        icon: Package,     color: "text-green-600 bg-green-50",
    description: "Asset lifecycle, warranty, procurement intake, disposal.",
  },
  {
    label: "Software Assets (SAM)", href: "/app/sam",        icon: Cpu,         color: "text-cyan-600 bg-cyan-50",
    description: "License compliance, software catalog, entitlement management.",
  },
  {
    label: "CMDB",                  href: "/app/cmdb",       icon: Server,      color: "text-indigo-600 bg-indigo-50",
    description: "Configuration items, relationships, discovery automation.",
  },
  {
    label: "On-Call Management",    href: "/app/on-call",    icon: Radio,       color: "text-teal-600 bg-teal-50",
    description: "Rotation schedules, escalation policies, paging integrations.",
  },
];

export default function ITServicesDashboard() {
  const { can } = useRBAC();

  const { data: statusCounts, isLoading: loadingStatus } = trpc.tickets.statusCounts.useQuery();
  const { data: recentTicketsPage, isLoading: loadingTickets } = trpc.tickets.list.useQuery({ type: "incident", limit: 5 });
  const { data: workOrderMetrics, isLoading: loadingWO } = trpc.workOrders.metrics.useQuery();
  const { data: changesPage, isLoading: loadingChanges } = trpc.changes.list.useQuery({ limit: 200 });

  if (!can("incidents", "read") && !can("work_orders", "read") && !can("cmdb", "read")) {
    return <AccessDenied module="IT Services" />;
  }

  const recentTickets = recentTicketsPage?.items ?? [];
  const changes = changesPage?.items ?? [];

  const totalOpenTickets = statusCounts
    ? statusCounts.filter((s: any) => !["closed", "resolved", "cancelled"].includes(s.name.toLowerCase())).reduce((a: any, b) => a + b.count, 0)
    : 0;
  const totalTickets = statusCounts ? statusCounts.reduce((a: any, b) => a + b.count, 0) : 0;
  const slaCompliance = totalTickets > 0
    ? Math.round(((recentTickets.filter((t: any) => !t.slaBreached).length) / Math.max(recentTickets.length, 1)) * 100)
    : 0;
  const openIncidents = statusCounts
    ? statusCounts.filter((s: any) => ["open", "new", "in progress", "in_progress", "assigned"].includes(s.name.toLowerCase())).reduce((a: any, b) => a + b.count, 0)
    : 0;

  const alerts = [
    workOrderMetrics && workOrderMetrics.breached > 0
      ? { color: "bg-red-500",    text: `${workOrderMetrics.breached} work order${workOrderMetrics.breached !== 1 ? "s" : ""} have breached SLA` }
      : null,
    recentTickets.filter((t: any) => t.slaBreached).length > 0
      ? { color: "bg-orange-500", text: `${recentTickets.filter((t: any) => t.slaBreached).length} incident${recentTickets.filter((t: any) => t.slaBreached).length !== 1 ? "s" : ""} have breached SLA` }
      : null,
    changes.length > 0
      ? { color: "bg-blue-500",   text: `${changes.length} change request${changes.length !== 1 ? "s" : ""} in the system` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Open", v: loadingStatus ? "…" : String(totalOpenTickets) },
      { k: "Incidents", v: loadingStatus ? "…" : String(openIncidents) },
    ],
    [
      { k: "Changes", v: loadingChanges ? "…" : String(changes.length) },
    ],
    [
      { k: "Open WOs", v: loadingWO ? "…" : String(workOrderMetrics?.open ?? 0) },
      { k: "Critical", v: loadingWO ? "…" : String(workOrderMetrics?.critical ?? 0) },
    ],
    [{ k: "Events", v: "—" }],
    [{ k: "Assets", v: "—" }],
    [{ k: "Licenses", v: "—" }],
    [{ k: "CIs", v: "—" }],
    [{ k: "On-Call", v: "—" }],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Monitor className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">IT Services</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">IT Services Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">8 modules · live data</span>
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
        <KPICard label="Open Incidents" value={openIncidents} color="text-red-700" icon={AlertTriangle} href="/app/tickets?type=incident" isLoading={loadingStatus} />
        <KPICard label="Total Open Tickets" value={totalOpenTickets} color="text-blue-700" icon={TicketIcon} href="/app/tickets" isLoading={loadingStatus} />
        <KPICard label="SLA Compliance" value={`${slaCompliance}%`} color="text-green-700" icon={CheckCircle2} href="/app/reports?tab=sla" isLoading={loadingTickets} />
        <KPICard label="Open Work Orders" value={workOrderMetrics?.open ?? "—"} color="text-orange-700" icon={Wrench} href="/app/work-orders" isLoading={loadingWO} />
      </div>

      <div className="grid grid-cols-4 gap-2">
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

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Incidents</span>
          </div>
          <Link href="/app/tickets" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
            Full queue <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingTickets ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-[12px]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading incidents…
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr><th>Number</th><th>Description</th><th>Type</th><th>SLA</th><th>Age</th></tr>
            </thead>
            <tbody>
              {(recentTickets ?? []).length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-4 text-[12px]">No incidents found</td></tr>
              ) : (recentTickets ?? []).map((inc: any) => (
                <tr key={inc.id}>
                  <td><Link href="/app/tickets" className="font-mono text-[11px] text-primary hover:underline">{inc.number}</Link></td>
                  <td className="max-w-xs"><span className="truncate block text-foreground">{inc.title}</span></td>
                  <td>
                    <span className="status-badge text-muted-foreground bg-muted capitalize">{inc.type}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${inc.slaBreached ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100"}`}>
                      {inc.slaBreached ? "Breached" : "On Track"}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted-foreground">{formatRelativeTime(inc.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
