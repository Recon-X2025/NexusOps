"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/lib/trpc";
import { downloadCSV } from "@/lib/utils";
import { toast } from "sonner";

type WOListItem = inferRouterOutputs<AppRouter>["workOrders"]["list"]["items"][number];
import {
  Wrench,
  Plus,
  Filter,
  Download,
  RefreshCw,
  Flame,
  Clock,
  ChevronUp,
  ChevronDown,
  Search,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Truck,
  PlayCircle,
  PauseCircle,
} from "lucide-react";

type WOState =
  | "draft" | "open" | "pending_dispatch" | "dispatched"
  | "work_in_progress" | "on_hold" | "complete" | "cancelled" | "closed";

type WOPriority = "1_critical" | "2_high" | "3_moderate" | "4_low" | "5_planning";

const STATE_CONFIG: Record<WOState, { label: string; color: string; Icon: React.ElementType }> = {
  draft:            { label: "Draft",            color: "text-muted-foreground bg-muted",  Icon: Circle },
  open:             { label: "Open",             color: "text-blue-700 bg-blue-100",    Icon: Circle },
  pending_dispatch: { label: "Pend. Dispatch",   color: "text-yellow-700 bg-yellow-100", Icon: Clock },
  dispatched:       { label: "Dispatched",        color: "text-indigo-700 bg-indigo-100", Icon: Truck },
  work_in_progress: { label: "Work in Progress", color: "text-orange-700 bg-orange-100", Icon: PlayCircle },
  on_hold:          { label: "On Hold",           color: "text-gray-600 bg-gray-100",   Icon: PauseCircle },
  complete:         { label: "Complete",          color: "text-green-700 bg-green-100", Icon: CheckCircle2 },
  cancelled:        { label: "Cancelled",         color: "text-red-700 bg-red-100",     Icon: Circle },
  closed:           { label: "Closed",            color: "text-muted-foreground bg-muted", Icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<WOPriority, { label: string; bar: string; text: string }> = {
  "1_critical": { label: "1 - Critical", bar: "bg-red-600",    text: "text-red-700 font-semibold" },
  "2_high":     { label: "2 - High",     bar: "bg-orange-500", text: "text-orange-700" },
  "3_moderate": { label: "3 - Moderate", bar: "bg-yellow-500", text: "text-yellow-700" },
  "4_low":      { label: "4 - Low",      bar: "bg-green-500",  text: "text-green-700" },
  "5_planning": { label: "5 - Planning", bar: "bg-slate-400",  text: "text-muted-foreground" },
};

const TYPE_LABELS: Record<string, string> = {
  corrective: "Corrective",
  preventive: "Preventive",
  installation: "Installation",
  inspection: "Inspection",
  repair: "Repair",
  upgrade: "Upgrade",
  decommission: "Decommission",
};

const STATE_TABS = [
  { key: "all",              label: "All",              module: "work_orders" as const, action: "read"   as const },
  { key: "open",             label: "Open",             module: "work_orders" as const, action: "read"   as const },
  { key: "pending_dispatch", label: "Pending Dispatch", module: "work_orders" as const, action: "assign" as const },
  { key: "dispatched",       label: "Dispatched",       module: "work_orders" as const, action: "assign" as const },
  { key: "work_in_progress", label: "In Progress",      module: "work_orders" as const, action: "write"  as const },
  { key: "on_hold",          label: "On Hold",          module: "work_orders" as const, action: "read"   as const },
  { key: "complete",         label: "Complete",         module: "work_orders" as const, action: "read"   as const },
];

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

function ageLabel(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 1) return "<1h";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function WorkOrdersPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = useMemo(() => STATE_TABS.filter((t) => can(t.module, t.action)), [can]);
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? "all");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === activeTab)) setActiveTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, activeTab]);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [woActionPanel, setWoActionPanel] = useState<"assign" | "state" | null>(null);
  const [woNewState, setWoNewState] = useState<string>("");
  const [woActionMsg, setWoActionMsg] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const { data, isLoading, refetch } = trpc.workOrders.list.useQuery({
    state: (activeTab !== "all" ? activeTab : undefined) as "open" | "closed" | "draft" | "work_in_progress" | "dispatched" | "pending_dispatch" | "on_hold" | "complete" | "cancelled" | undefined,
    search: search || undefined,
    limit: 100,
  }, mergeTrpcQueryOpts("workOrders.list", undefined));

  const { data: metrics } = trpc.workOrders.metrics.useQuery(undefined, mergeTrpcQueryOpts("workOrders.metrics", undefined));

  const updateState = trpc.workOrders.updateState.useMutation({
    onSuccess: (result) => {
      setWoActionMsg(`Updated ${Array.isArray(result) ? result.length : 1} work order(s)`);
      setSelected(new Set()); setWoActionPanel(null); setWoNewState("");
      refetch(); setTimeout(() => setWoActionMsg(null), 3000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const handleBulkStateChange = (state: string) => {
    Array.from(selected).forEach((id) => updateState.mutate({ id, state: state as WOState }));
  };

  const items = data?.items ?? [];
  const filteredItems = items.filter((i: WOListItem) => {
    if (filterType && i.type !== filterType) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    return true;
  });

  const toggleAll = () => {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i: WOListItem) => i.id)));
    }
  };

  if (!can("work_orders", "read")) return <AccessDenied module="Field Service Management" />;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Work Orders</h1>
          <span className="text-[11px] text-muted-foreground/70 font-normal">
            Field Service Management
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button
            onClick={() => downloadCSV(items.map((w: WOListItem) => ({ Number: (w as any).number, Description: (w as any).shortDescription ?? "", State: (w as any).state, Priority: (w as any).priority ?? "", Assigned_To: (w as any).assignedToId ?? "Unassigned", Location: (w as any).location ?? "", Created: new Date((w as any).createdAt).toLocaleDateString("en-IN") })), "work_orders_export")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <Link
            href="/app/work-orders/new"
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] font-medium rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Work Order
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      {metrics && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",    value: metrics.total,    color: "text-foreground/80" },
            { label: "Open",     value: metrics.open,     color: "text-blue-700" },
            { label: "Critical", value: metrics.critical, color: "text-red-700" },
            { label: "SLA Breached", value: metrics.breached, color: "text-red-700" },
          ].map((k) => (
            <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
              <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-card border border-border rounded flex-1 max-w-xs">
          <Search className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search work orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[12px] text-foreground/80 placeholder:text-muted-foreground/70 outline-none flex-1"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] border rounded bg-card hover:bg-muted/30 ${showFilters || filterType || filterPriority ? "border-primary text-primary" : "text-muted-foreground border-border"}`}
        >
          <Filter className="w-3 h-3" /> Filters
          {(filterType || filterPriority) && <span className="w-1.5 h-1.5 rounded-full bg-primary ml-0.5" />}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border border-border rounded text-[11px]">
          <span className="text-muted-foreground font-medium">Filter by:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-background text-foreground text-[11px]"
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-background text-foreground text-[11px]"
          >
            <option value="">All Priorities</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {(filterType || filterPriority) && (
            <button
              onClick={() => { setFilterType(""); setFilterPriority(""); }}
              className="text-muted-foreground hover:text-foreground underline"
            >Clear</button>
          )}
        </div>
      )}

      {/* State tabs */}
      <div className="flex items-center gap-0 border-b border-border bg-card rounded-t">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-b overflow-hidden flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground/70">
            Loading work orders...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground/70">
            No work orders found
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleAll}
                    className="accent-primary"
                  />
                </th>
                <th className="w-4" />
                <th>Number</th>
                <th>Short Description</th>
                <th>Type</th>
                <th>Priority</th>
                <th>State</th>
                <th>Location</th>
                <th>Category</th>
                <th>
                  <button
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    className="flex items-center gap-0.5"
                  >
                    Created
                    {sortDir === "asc" ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </th>
                <th>Scheduled End</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((wo: WOListItem) => {
                const pCfg = PRIORITY_CONFIG[wo.priority as WOPriority];
                const sCfg = STATE_CONFIG[wo.state as WOState];
                const StateIcon = sCfg?.Icon ?? Circle;
                return (
                  <tr
                    key={wo.id}
                    className={selected.has(wo.id) ? "bg-blue-50" : undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(wo.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(wo.id) : next.delete(wo.id);
                          setSelected(next);
                        }}
                        className="accent-primary"
                      />
                    </td>
                    <td className="p-0 w-1">
                      <div className={`priority-bar ${pCfg?.bar ?? "bg-border"}`} />
                    </td>
                    <td>
                      <Link
                        href={`/app/work-orders/${wo.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {wo.number}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <div className="flex items-center gap-1">
                        {wo.slaBreached && (
                          <span title="SLA Breached" className="inline-flex">
                            <Flame className="w-3 h-3 text-red-500 flex-shrink-0" aria-hidden />
                          </span>
                        )}
                        <Link
                          href={`/app/work-orders/${wo.id}`}
                          className="truncate hover:underline text-foreground"
                        >
                          {wo.shortDescription}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px]">
                        {TYPE_LABELS[wo.type] ?? wo.type}
                      </span>
                    </td>
                    <td>
                      <span className={`text-[11px] ${pCfg?.text ?? ""}`}>
                        {pCfg?.label ?? wo.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${sCfg?.color ?? ""}`}>
                        <StateIcon className="w-3 h-3 inline mr-0.5" />
                        {sCfg?.label ?? wo.state}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{wo.location ?? "—"}</td>
                    <td className="text-muted-foreground">{wo.category ?? "—"}</td>
                    <td className="text-muted-foreground">{ageLabel(wo.createdAt)} ago</td>
                    <td className="text-muted-foreground">
                      {wo.scheduledEndDate ? (
                        <span
                          className={
                            new Date(wo.scheduledEndDate) < new Date()
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {formatDate(wo.scheduledEndDate)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-1 text-[11px] text-muted-foreground px-1">
        <div className="flex items-center justify-between">
          <span>
            {selected.size > 0
              ? `${selected.size} record${selected.size > 1 ? "s" : ""} selected`
              : `${filteredItems.length} record${filteredItems.length !== 1 ? "s" : ""}${filterType || filterPriority ? " (filtered)" : ""}`}
          </span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              {woActionMsg && <span className="text-green-700 font-medium">{woActionMsg}</span>}
              <button
                onClick={() => setWoActionPanel(woActionPanel === "state" ? null : "state")}
                className="text-primary hover:underline"
              >
                Change State
              </button>
              <button
                disabled={updateState.isPending}
                onClick={() => handleBulkStateChange("cancelled")}
                className="text-red-600 hover:underline disabled:opacity-50"
              >
                {updateState.isPending ? "…" : "Cancel"}
              </button>
            </div>
          )}
        </div>
        {woActionPanel === "state" && selected.size > 0 && (
          <div className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5 border border-border">
            <span className="text-[11px] text-muted-foreground">Set state to:</span>
            <select
              value={woNewState}
              onChange={(e) => setWoNewState(e.target.value)}
              className="text-xs border border-border rounded px-2 py-0.5 bg-background"
            >
              <option value="">— Choose —</option>
              {(["open","pending_dispatch","dispatched","work_in_progress","on_hold","complete","closed"] as WOState[]).map((s) => (
                <option key={s} value={s}>{STATE_CONFIG[s]?.label ?? s}</option>
              ))}
            </select>
            <button
              disabled={!woNewState || updateState.isPending}
              onClick={() => handleBulkStateChange(woNewState)}
              className="px-3 py-0.5 rounded bg-primary text-white text-[11px] hover:bg-primary/90 disabled:opacity-50"
            >
              {updateState.isPending ? "…" : "Apply"}
            </button>
            <button onClick={() => setWoActionPanel(null)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
