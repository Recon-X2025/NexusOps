"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, Zap, CheckCircle2, XCircle, RefreshCw,
  Bell, Eye, Search, Filter, Clock, Cpu, HardDrive, Wifi, Shield,
  Server, Database, BarChart2, ChevronDown, BellOff, GitMerge,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Severity = "critical" | "major" | "minor" | "warning" | "info" | "clear";
type EventState = "open" | "in_progress" | "resolved" | "suppressed" | "flapping";

const SEVERITY_CFG: Record<Severity, { label: string; color: string; dot: string; bar: string }> = {
  critical: { label: "Critical", color: "text-red-700 bg-red-100",       dot: "bg-red-600",    bar: "bg-red-600" },
  major:    { label: "Major",    color: "text-orange-700 bg-orange-100", dot: "bg-orange-500", bar: "bg-orange-500" },
  minor:    { label: "Minor",    color: "text-yellow-700 bg-yellow-100", dot: "bg-yellow-500", bar: "bg-yellow-500" },
  warning:  { label: "Warning",  color: "text-amber-700 bg-amber-100",   dot: "bg-amber-400",  bar: "bg-amber-400" },
  info:     { label: "Info",     color: "text-blue-700 bg-blue-100",     dot: "bg-blue-500",   bar: "bg-blue-500" },
  clear:    { label: "Clear",    color: "text-green-700 bg-green-100",   dot: "bg-green-500",  bar: "bg-green-500" },
};

const STATE_CFG: Record<EventState, { label: string; color: string }> = {
  open:        { label: "Open",        color: "text-red-700 bg-red-100" },
  in_progress: { label: "In Progress", color: "text-blue-700 bg-blue-100" },
  resolved:    { label: "Resolved",    color: "text-green-700 bg-green-100" },
  suppressed:  { label: "Suppressed",  color: "text-muted-foreground bg-muted" },
  flapping:    { label: "Flapping",    color: "text-orange-700 bg-orange-100" },
};

const STATUS_COLOR: Record<string, string> = {
  healthy: "bg-green-500",
  warning: "bg-yellow-500",
  degraded: "bg-orange-500",
  critical: "bg-red-600",
};

function ago(dt: string) {
  const ms = Date.now() - new Date(dt.replace(" ", "T")).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

const TABS = [
  { key: "all",      label: "All Events", module: "events" as const, action: "read" as const },
  { key: "open",     label: "Active",     module: "events" as const, action: "read" as const },
  { key: "critical", label: "Critical",   module: "events" as const, action: "read" as const },
  { key: "flapping", label: "Flapping", module: "events" as const, action: "read" as const },
  { key: "resolved", label: "Resolved", module: "events" as const, action: "read" as const },
];

export default function EventManagementPage() {
  const { can } = useRBAC();
  const router = useRouter();
  const visibleTabs = TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const eventsQuery = trpc.events.list.useQuery({ limit: 50 });

  if (!can("events", "read")) return <AccessDenied module="Event Management" />;

  // @ts-ignore
  const acknowledgeEvent = trpc.events.acknowledge?.useMutation?.({
    onSuccess: () => { eventsQuery.refetch(); toast.success("Event acknowledged"); },
    onError: (e: any) => { console.error("events.acknowledge failed:", e); toast.error(e.message || "Failed to acknowledge event"); },
  });
  // @ts-ignore
  const suppressEvent = trpc.events.suppress?.useMutation?.({
    onSuccess: () => { eventsQuery.refetch(); toast.success("Event suppressed"); },
    onError: (e: any) => { console.error("events.suppress failed:", e); toast.error(e.message || "Failed to suppress event"); },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEvents: any[] = eventsQuery.data?.items ?? [];

  const displayed = allEvents.filter((e) => {
    if (tab === "critical") return e.severity === "critical";
    if (tab === "open") return e.state === "open" || e.state === "in_progress";
    if (tab === "flapping") return e.state === "flapping";
    if (tab === "resolved") return e.state === "resolved";
    return true;
  }).filter((e) =>
    !search ||
    (e.node ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.metric ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const critCount = allEvents.filter((e) => e.severity === "critical" && e.state !== "resolved").length;
  const openCount = allEvents.filter((e) => e.state === "open" || e.state === "in_progress").length;
  const linkedCount = allEvents.filter((e) => e.linkedIncident).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Event Management</h1>
          <span className="text-[11px] text-muted-foreground/70">IT Operations — AIOps Alert Correlation</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/app/admin?tab=notifications")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
          >
            <BellOff className="w-3 h-3" /> Suppression Rules
          </button>
          <button
            onClick={() => router.push("/app/admin?tab=system")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
          >
            <GitMerge className="w-3 h-3" /> Correlation Policies
          </button>
          <button
            onClick={() => router.push("/app/admin?tab=integrations")}
            className="flex items-center gap-1 px-2 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Bell className="w-3 h-3" /> Alert Sources
          </button>
        </div>
      </div>

      {/* Service Health Heatmap */}
      <div className="bg-card border border-border rounded">
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Service Health Overview
          </span>
          <span className="text-[11px] text-muted-foreground/70 ml-auto">Auto-refreshes every 60s</span>
        </div>
        <div className="p-3">
          <p className="text-center text-[11px] text-muted-foreground/50 py-4">Service health topology not available — connect a monitoring source to populate this view</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Critical Alerts",   value: critCount,    color: "text-red-700",    border: "border-red-200" },
          { label: "Active Events",     value: openCount,    color: "text-orange-700", border: "border-orange-200" },
          { label: "Linked Incidents",  value: linkedCount,  color: "text-blue-700",   border: "border-border" },
          { label: "Suppressed",        value: "—",          color: "text-muted-foreground",  border: "border-border" },
          { label: "Auto-Resolved (1h)", value: "—",         color: "text-green-700",  border: "border-green-200" },
        ].map((k) => (
          <div key={k.label} className={`bg-card border rounded px-3 py-2 ${k.border}`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-card border border-border rounded flex-1 max-w-xs">
          <Search className="w-3 h-3 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search node or metric..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[12px] outline-none flex-1 placeholder:text-muted-foreground/70"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] border rounded bg-card ${showFilters ? "border-primary text-primary" : "border-border"}`}
        >
          <Filter className="w-3 h-3" /> Filters
        </button>
      </div>

      <div className="flex items-center gap-0 border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
          >
            {t.label}
            {t.key === "critical" && critCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">{critCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {eventsQuery.isLoading ? (
          <div className="animate-pulse p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        ) : eventsQuery.isError ? (
          <div className="text-center py-8 text-muted-foreground text-[12px]">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
            Failed to load events. Please try again.
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
            <p className="text-[13px]">No events match your filters</p>
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Severity</th>
                <th>Node / CI</th>
                <th>Metric / Alert</th>
                <th>Current Value</th>
                <th>Threshold</th>
                <th>State</th>
                <th>Count</th>
                <th>Source</th>
                <th>Last Occurred</th>
                <th>Incident</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {displayed.map((evt: any) => {
                const sev = SEVERITY_CFG[evt.severity as Severity] ?? SEVERITY_CFG.info;
                const st = STATE_CFG[evt.state as EventState] ?? STATE_CFG.open;
                return (
                  <>
                    <tr
                      key={evt.id}
                      className={`cursor-pointer ${expandedId === evt.id ? "bg-blue-50" : ""}`}
                      onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
                    >
                      <td className="p-0">
                        <div className={`priority-bar ${sev.bar}`} />
                      </td>
                      <td>
                        <span className={`status-badge font-semibold ${sev.color}`}>
                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${sev.dot} animate-pulse`} />
                          {sev.label}
                        </span>
                      </td>
                      <td className="font-mono text-[11px] text-primary">{evt.node}</td>
                      <td className="text-foreground/80">{evt.metric}</td>
                      <td className={`font-mono text-[12px] font-semibold ${evt.severity === "critical" ? "text-red-700" : evt.severity === "major" ? "text-orange-600" : "text-foreground/80"}`}>
                        {evt.value}
                      </td>
                      <td className="text-muted-foreground text-[11px]">{evt.threshold}</td>
                      <td><span className={`status-badge ${st.color}`}>{st.label}</span></td>
                      <td className="text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${(evt.count ?? 0) > 20 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
                          {evt.count ?? 0}
                        </span>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{evt.source}</td>
                      <td className="text-muted-foreground text-[11px]">{evt.lastOccurrence ? ago(evt.lastOccurrence) : "—"}</td>
                      <td>
                        {evt.linkedIncident ? (
                          <Link href={`/app/tickets`} className="text-primary text-[11px] hover:underline font-mono">
                            {evt.linkedIncident}
                          </Link>
                        ) : (
                          <button
                            className="text-[11px] text-muted-foreground/70 hover:text-primary"
                            onClick={(e) => { e.stopPropagation(); router.push(`/app/tickets/new?type=incident&source=event&node=${encodeURIComponent(evt.node ?? "")}&metric=${encodeURIComponent(evt.metric ?? "")}`); }}
                          >+ Create</button>
                        )}
                      </td>
                    </tr>
                    {expandedId === evt.id && (
                      <tr key={`${evt.id}-exp`} className="bg-blue-50/60">
                        <td />
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex gap-6">
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                AIOps Root Cause Analysis
                              </p>
                              <div className="flex items-start gap-2 p-2 bg-purple-50 border border-purple-200 rounded">
                                <Zap className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
                                <p className="text-[12px] text-purple-800">{evt.aiRootCause ?? "Analysis in progress…"}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 text-[11px]">
                              <div className="text-muted-foreground">First: {evt.firstOccurrence ?? "—"}</div>
                              <div className="text-muted-foreground">Last: {evt.lastOccurrence ?? "—"}</div>
                              <div className="text-muted-foreground">Event count: {evt.count ?? 0}</div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <button
                                className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                                onClick={(e) => { e.stopPropagation(); router.push(`/app/tickets/new?type=incident&source=event&node=${encodeURIComponent(evt.node ?? "")}&metric=${encodeURIComponent(evt.metric ?? "")}`); }}
                              >
                                Create Incident
                              </button>
                              <button
                                className="px-3 py-1 border border-border rounded text-[11px] text-muted-foreground hover:bg-muted/30"
                                onClick={(e) => { e.stopPropagation(); suppressEvent?.mutate?.({ id: evt.id, suppressUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() }); }}
                              >
                                Suppress 1hr
                              </button>
                              <button
                                className="px-3 py-1 border border-green-300 rounded text-[11px] text-green-700 hover:bg-green-50"
                                onClick={(e) => { e.stopPropagation(); acknowledgeEvent?.mutate?.({ id: evt.id }); }}
                              >
                                Resolve
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          {displayed.length} events · {eventsQuery.dataUpdatedAt ? `Last polled ${ago(new Date(eventsQuery.dataUpdatedAt).toISOString().replace("T", " ").slice(0, 19))}` : "Loading…"}
        </div>
      </div>
    </div>
  );
}
