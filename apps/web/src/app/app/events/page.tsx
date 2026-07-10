"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, Zap, CheckCircle2, XCircle, RefreshCw,
  Bell, Eye, Search, Filter, Clock, Cpu, HardDrive, Wifi, Shield,
  Server, Database, BarChart2, ChevronDown, BellOff, GitMerge, Plus, X,
} from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  { key: "rules",    label: "Suppression Rules", module: "events" as const, action: "read" as const },
  { key: "policies", label: "Correlation Policies", module: "events" as const, action: "read" as const },
  { key: "sources",  label: "Alert Sources", module: "events" as const, action: "read" as const },
  { key: "resolved", label: "Resolved", module: "events" as const, action: "read" as const },
];

export default function EventManagementPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", condition: "", suppressUntil: "", status: "active" });
  const [ruleTab, setRuleTab] = useState("all");
  
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: "", condition: "", action: "", status: "active" });

  const [showNewSource, setShowNewSource] = useState(false);
  const [newSource, setNewSource] = useState({ provider: "datadog", status: "connected" });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const eventsQuery = trpc.events.list.useQuery({ limit: 50 }, mergeTrpcQueryOpts("events.list", undefined));
  // @ts-ignore
  const rulesQuery = trpc.events.listSuppressionRules.useQuery(undefined, mergeTrpcQueryOpts("events.listSuppressionRules", undefined));
  // @ts-ignore
  const policiesQuery = trpc.events.listCorrelationPolicies.useQuery(undefined, mergeTrpcQueryOpts("events.listCorrelationPolicies", undefined));
  // @ts-ignore
  const integrationsQuery = trpc.events.listIntegrations.useQuery(undefined, mergeTrpcQueryOpts("events.listIntegrations", undefined));

  // All mutations declared BEFORE the access-denied guard — Rules of Hooks compliance
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
  const createRule = trpc.events.createSuppressionRule.useMutation({
    onSuccess: () => { toast.success("Rule created successfully"); setShowNewRule(false); setNewRule({ name: "", condition: "", suppressUntil: "", status: "active" }); rulesQuery.refetch(); },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  // @ts-ignore
  const createPolicy = trpc.events.createCorrelationPolicy.useMutation({
    onSuccess: () => { toast.success("Policy created successfully"); setShowNewPolicy(false); setNewPolicy({ name: "", condition: "", action: "", status: "active" }); policiesQuery.refetch(); },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  // @ts-ignore
  const createIntegration = trpc.events.createIntegration.useMutation({
    onSuccess: () => { toast.success("Source created successfully"); setShowNewSource(false); integrationsQuery.refetch(); },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  if (!can("events", "read")) return <AccessDenied module="Event Management" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEvents: any[] = eventsQuery.data?.items ?? [];

  // Build unified events array
  const unifiedEvents: any[] = [
    ...allEvents.map(e => ({ ...e, _uiType: "event" })),
    ...(rulesQuery.data || []).map((r: any) => ({ ...r, _uiType: "rule", severity: r.active ? "info" : "critical", state: r.active ? "open" : "suppressed" })),
    ...(policiesQuery.data || []).map((p: any) => ({ ...p, _uiType: "policy", severity: p.active ? "info" : "critical", state: p.active ? "open" : "suppressed" })),
    ...(integrationsQuery.data || []).map((i: any) => ({ ...i, _uiType: "source", severity: i.status === "connected" ? "info" : "critical", state: i.status === "connected" ? "open" : "suppressed" }))
  ];

  const displayed = unifiedEvents.filter((e) => {
    if (tab === "critical") return e.severity === "critical";
    if (tab === "open") return e.state === "open" || e.state === "in_progress" || (e._uiType !== "event" && e.active !== false && e.status !== "error");
    if (tab === "resolved") return e.state === "resolved";
    return true;
  }).filter((e) =>
    !search ||
    (e.node ?? e.name ?? e.provider ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.metric ?? e.condition ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const critCount = unifiedEvents.filter((e) => e.severity === "critical" && e.state !== "resolved").length;
  const openCount = unifiedEvents.filter((e) => (e.state === "open" || e.state === "in_progress") && e.severity !== "critical").length;
  const linkedCount = unifiedEvents.filter((e) => e.linkedIncident).length;
  const suppressedCount = unifiedEvents.filter((e) => e.state === "suppressed").length;
  const recentlyResolved = unifiedEvents.filter((e) => {
    if (e.state !== "resolved" || !e.resolvedAt) return false;
    return Date.now() - new Date(e.resolvedAt).getTime() < 60 * 60 * 1000;
  }).length;

  // Build service health chart data from live event data
  const nodeHealthMap = new Map<string, number>();
  unifiedEvents.filter((e) => e.state !== "resolved").forEach((e) => {
    const node = e.node ?? e.name ?? e.provider ?? "Unknown";
    const cur = nodeHealthMap.get(node) ?? 0;
    const sev = e.severity as Severity;
    if (sev === "critical") {
      nodeHealthMap.set(node, cur + 1);
    } else {
      if (!nodeHealthMap.has(node)) nodeHealthMap.set(node, 0);
    }
  });

  const chartData = Array.from(nodeHealthMap.entries()).map(([name, criticals]) => ({ name, criticals }));

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
            onClick={() => setShowNewRule(true)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] border rounded transition-colors text-muted-foreground border-border hover:bg-muted/30`}
          >
            <BellOff className="w-3 h-3" /> Suppression Rules
          </button>
          <button
            onClick={() => setShowNewPolicy(true)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] border rounded transition-colors text-muted-foreground border-border hover:bg-muted/30`}
          >
            <GitMerge className="w-3 h-3" /> Correlation Policies
          </button>
          <button
            onClick={() => setShowNewSource(true)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] border rounded transition-colors text-muted-foreground border-border hover:bg-muted/30`}
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
        <div className="p-4 h-48 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-center text-[11px] text-muted-foreground/50">No active events — all systems appear healthy</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#6b7280' }} 
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#6b7280' }} 
                  axisLine={false} 
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ fontSize: '11px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="criticals" name="Critical Alerts" fill="#dc2626" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "Critical Alerts",   value: critCount,    color: "text-red-700",    border: "border-red-200" },
          { label: "Active Events",     value: openCount,    color: "text-orange-700", border: "border-orange-200" },
          { label: "Linked Incidents",  value: linkedCount,  color: "text-blue-700",   border: "border-border" },
          { label: "Suppressed",        value: suppressedCount,          color: "text-muted-foreground",  border: "border-border" },
          { label: "Auto-Resolved (1h)", value: recentlyResolved,         color: "text-green-700",  border: "border-green-200" },
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
        {tab === "rules" ? (
          <div className="p-0">
            <div className="flex justify-between items-center p-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground ml-2 mr-4">Suppression Rules</span>
                <div className="flex bg-background border border-border rounded overflow-hidden">
                  <button onClick={() => setRuleTab("all")} className={`px-3 py-1 text-[11px] font-medium transition-colors ${ruleTab === "all" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>All</button>
                  <button onClick={() => setRuleTab("active")} className={`px-3 py-1 text-[11px] font-medium transition-colors border-l border-border ${ruleTab === "active" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>Active</button>
                  <button onClick={() => setRuleTab("critical")} className={`px-3 py-1 text-[11px] font-medium transition-colors border-l border-border ${ruleTab === "critical" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>Critical</button>
                </div>
              </div>
              <button onClick={() => setShowNewRule(true)} className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 flex items-center gap-1"><Plus className="w-3 h-3" /> New Rule</button>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Condition</th>
                  <th>Suppress Until</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rulesQuery.data?.filter(r => {
                  if (ruleTab === "active") return r.active;
                  if (ruleTab === "critical") return !r.active; // Mock critical filter
                  return true;
                }).map((rule: any) => (
                  <tr key={rule.id}>
                    <td className="font-medium">{rule.name}</td>
                    <td className="font-mono text-[11px] text-primary">{rule.condition}</td>
                    <td className="text-muted-foreground text-[11px]">{rule.suppressUntil ? new Date(rule.suppressUntil).toLocaleString() : "Indefinite"}</td>
                    <td><span className={`status-badge ${rule.active ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>{rule.active ? "Active" : "Critical"}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="text-[11px] text-primary hover:underline">Edit</button>
                        <button className="text-[11px] text-orange-600 hover:underline">Archive</button>
                        <button className="text-[11px] text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!rulesQuery.data || rulesQuery.data.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-[11px]">No suppression rules found</td></tr>
                )}
              </tbody>
             </table>
          </div>
        ) : tab === "policies" ? (
          <div className="p-0">
            <div className="flex justify-between items-center p-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground ml-2 mr-4">Correlation Policies</span>
              <button onClick={() => setShowNewPolicy(true)} className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 flex items-center gap-1"><Plus className="w-3 h-3" /> New Policy</button>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Policy Name</th>
                  <th>Condition</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policiesQuery.data?.map((policy: any) => (
                  <tr key={policy.id}>
                    <td className="font-medium">{policy.name}</td>
                    <td className="font-mono text-[11px] text-primary">{policy.condition}</td>
                    <td><span className="status-badge text-blue-700 bg-blue-100">{policy.action}</span></td>
                    <td><span className={`status-badge ${policy.active ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>{policy.active ? "Active" : "Inactive"}</span></td>
                    <td><button className="text-[11px] text-primary hover:underline">Edit</button></td>
                  </tr>
                ))}
                {(!policiesQuery.data || policiesQuery.data.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-[11px]">No correlation policies found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "sources" ? (
          <div className="p-0">
            <div className="flex justify-between items-center p-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground ml-2 mr-4">Alert Sources</span>
              <button onClick={() => setShowNewSource(true)} className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 flex items-center gap-1"><Plus className="w-3 h-3" /> New Source</button>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th>Last Error</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrationsQuery.data?.map((integ: any) => (
                  <tr key={integ.id}>
                    <td className="font-medium capitalize">{integ.provider}</td>
                    <td>
                      <span className={`status-badge ${integ.status === "connected" ? "text-green-700 bg-green-100" : integ.status === "error" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>
                        {integ.status}
                      </span>
                    </td>
                    <td className="text-muted-foreground text-[11px]">{integ.lastSyncAt ? new Date(integ.lastSyncAt).toLocaleString() : "Never"}</td>
                    <td className="text-red-600 text-[10px] max-w-xs truncate">{integ.lastError || "—"}</td>
                    <td>
                      <button className="text-[11px] text-primary hover:underline" onClick={() => router.push("/app/admin?tab=integrations")}>Manage</button>
                    </td>
                  </tr>
                ))}
                {(!integrationsQuery.data || integrationsQuery.data.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-[11px]">No active alert integrations found. Connect one in Admin Settings.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : eventsQuery.isLoading ? (
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
                <th>Type / Severity</th>
                <th>Name / Node</th>
                <th>Details / Metric</th>
                <th>Status / State</th>
                <th>Count</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {displayed.map((evt: any) => {
                const isEvent = evt._uiType === "event";
                const sev = SEVERITY_CFG[evt.severity as Severity] ?? SEVERITY_CFG.info;
                const st = STATE_CFG[evt.state as EventState] ?? STATE_CFG.open;
                
                const uiTypeLabel = isEvent ? "Event" : evt._uiType === "rule" ? "Rule" : evt._uiType === "policy" ? "Policy" : "Source";
                const nameNode = isEvent ? evt.node : evt.name ?? evt.provider;
                const detailsMetric = isEvent ? evt.metric : evt.condition ?? (evt.status === "connected" ? "Connected" : "Error");

                return (
                  <Fragment key={`${evt._uiType}-${evt.id}`}>
                    <tr
                      className={`cursor-pointer ${expandedId === evt.id ? "bg-blue-50" : ""}`}
                      onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
                    >
                      <td className="p-0">
                        <div className={`priority-bar ${sev.bar}`} />
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase text-muted-foreground font-semibold">{uiTypeLabel}</span>
                          {isEvent && (
                            <span className={`status-badge font-semibold ${sev.color} w-fit`}>
                              <span className={`inline-block w-2 h-2 rounded-full mr-1 ${sev.dot} animate-pulse`} />
                              {sev.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-[11px] text-primary">{nameNode}</td>
                      <td className="text-foreground/80 text-[12px]">{detailsMetric}</td>
                      <td>
                        {isEvent ? (
                          <span className={`status-badge ${st.color}`}>{st.label}</span>
                        ) : (
                          <span className={`status-badge ${evt.active === false || evt.status === "error" ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100"}`}>
                            {evt.active === false || evt.status === "error" ? "Critical / Inactive" : "Active"}
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {isEvent ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${(evt.count ?? 0) > 20 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
                            {evt.count ?? 0}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="text-muted-foreground text-[11px]">
                        {evt.lastOccurrence || evt.createdAt || evt.lastSyncAt ? ago(new Date(evt.lastOccurrence || evt.createdAt || evt.lastSyncAt).toISOString()) : "—"}
                      </td>
                      <td>
                        {evt.linkedIncidentId || evt.linkedIncident ? (
                          <Link href={`/app/tickets`} className="text-primary text-[11px] hover:underline font-mono">
                            {evt.linkedIncident || evt.linkedIncidentId?.slice(0, 8) || "TICKET"}
                          </Link>
                        ) : (
                          <button
                            className="text-[11px] text-muted-foreground/70 hover:text-primary"
                            onClick={(e) => { e.stopPropagation(); router.push(`/app/tickets/new?type=incident&source=${evt._uiType}&node=${encodeURIComponent(nameNode)}&metric=${encodeURIComponent(detailsMetric)}`); }}
                          >+ Create Incident</button>
                        )}
                      </td>
                    </tr>
                    {isEvent && expandedId === evt.id && (
                      <tr key={`${evt.id}-exp`} className="bg-blue-50/60">
                        <td />
                        <td colSpan={7} className="px-4 py-3">
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
                              <div className="text-muted-foreground">First: {evt.firstOccurrence ? new Date(evt.firstOccurrence).toLocaleString() : "—"}</div>
                              <div className="text-muted-foreground">Last: {evt.lastOccurrence ? new Date(evt.lastOccurrence).toLocaleString() : "—"}</div>
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          {tab === "rules" ? rulesQuery.data?.length ?? 0 : tab === "policies" ? policiesQuery.data?.length ?? 0 : displayed.length} items · {eventsQuery.dataUpdatedAt ? `Last polled ${ago(new Date(eventsQuery.dataUpdatedAt).toISOString())}` : "Loading…"}
        </div>
      </div>

      {/* New Suppression Rule Modal */}
      {showNewRule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">New Suppression Rule</h2>
              <button onClick={() => setShowNewRule(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Rule Name *</label>
                <input
                  value={newRule.name}
                  onChange={(e) => setNewRule(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. Ignore test nodes"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Condition</label>
                <input
                  value={newRule.condition}
                  onChange={(e) => setNewRule(n => ({ ...n, condition: e.target.value }))}
                  placeholder='condition'
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Suppress Until</label>
                <input
                  type="datetime-local"
                  value={newRule.suppressUntil}
                  onChange={(e) => setNewRule(n => ({ ...n, suppressUntil: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Status</label>
                <select
                  value={newRule.status}
                  onChange={(e) => setNewRule(n => ({ ...n, status: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="active">Active</option>
                  <option value="critical">Critical</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowNewRule(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={createRule.isPending}
                onClick={() => {
                  if (!newRule.name || !newRule.condition) {
                    toast.error("Name and Condition are required");
                    return;
                  }
                  createRule.mutate({
                    name: newRule.name,
                    condition: newRule.condition,
                    suppressUntil: newRule.suppressUntil || undefined,
                    active: newRule.status === "active",
                  });
                }}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createRule.isPending ? "Creating..." : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Correlation Policy Modal */}
      {showNewPolicy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">New Correlation Policy</h2>
              <button onClick={() => setShowNewPolicy(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Policy Name *</label>
                <input
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. Auto-incident on High CPU"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Condition</label>
                <input
                  value={newPolicy.condition}
                  onChange={(e) => setNewPolicy(n => ({ ...n, condition: e.target.value }))}
                  placeholder='count > 10 AND severity = critical'
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Action</label>
                <input
                  value={newPolicy.action}
                  onChange={(e) => setNewPolicy(n => ({ ...n, action: e.target.value }))}
                  placeholder='e.g. create_incident'
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Status</label>
                <select
                  value={newPolicy.status}
                  onChange={(e) => setNewPolicy(n => ({ ...n, status: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="active">Active</option>
                  <option value="critical">Critical</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowNewPolicy(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={createPolicy.isPending}
                onClick={() => {
                  if (!newPolicy.name || !newPolicy.condition || !newPolicy.action) {
                    toast.error("All fields are required");
                    return;
                  }
                  createPolicy.mutate({
                    name: newPolicy.name,
                    condition: newPolicy.condition,
                    action: newPolicy.action,
                    active: newPolicy.status === "active",
                  });
                }}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createPolicy.isPending ? "Creating..." : "Create Policy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Alert Source Modal */}
      {showNewSource && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">New Alert Source</h2>
              <button onClick={() => setShowNewSource(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Provider *</label>
                <select
                  value={newSource.provider}
                  onChange={(e) => setNewSource(n => ({ ...n, provider: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="datadog">Datadog</option>
                  <option value="newrelic">New Relic</option>
                  <option value="aws">AWS CloudWatch</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Status</label>
                <select
                  value={newSource.status}
                  onChange={(e) => setNewSource(n => ({ ...n, status: e.target.value }))}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="connected">Connected (Active)</option>
                  <option value="error">Error (Critical)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowNewSource(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={createIntegration.isPending}
                onClick={() => {
                  if (!newSource.provider) {
                    toast.error("Provider is required");
                    return;
                  }
                  createIntegration.mutate({
                    provider: newSource.provider,
                    status: newSource.status,
                  });
                }}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createIntegration.isPending ? "Connecting..." : "Connect Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
