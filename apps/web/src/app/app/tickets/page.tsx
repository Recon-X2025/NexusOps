"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Flame,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckSquare,
  Square,
  Download,
  MoreHorizontal,
  Circle,
  Clock,
  User,
  Tag,
  LayoutDashboard,
  List,
  Kanban,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Activity,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STALE_TIME } from "@/components/providers/trpc-provider";
import { formatRelativeTime, cn, downloadCSV } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  incident: "bg-red-500",
  request:  "bg-blue-500",
  problem:  "bg-purple-500",
  change:   "bg-cyan-500",
};

type SortField = "number" | "title" | "priority" | "status" | "type" | "createdAt";
type SortDir = "asc" | "desc";

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; bar: string; order: number }> = {
  Critical: { label: "Critical", color: "#dc2626", bg: "#fef2f2", bar: "#dc2626", order: 0 },
  High:     { label: "High",     color: "#ea580c", bg: "#fff7ed", bar: "#ea580c", order: 1 },
  Medium:   { label: "Medium",   color: "#d97706", bg: "#fffbeb", bar: "#d97706", order: 2 },
  Low:      { label: "Low",      color: "#16a34a", bg: "#f0fdf4", bar: "#16a34a", order: 3 },
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  incident: { label: "Incident",  color: "#dc2626" },
  request:  { label: "Request",   color: "#0356ca" },
  problem:  { label: "Problem",   color: "#7c3aed" },
  change:   { label: "Change",    color: "#0891b2" },
};

const STATUS_COLORS: Record<string, string> = {
  open:        "#0356ca",
  in_progress: "#7c3aed",
  pending:     "#d97706",
  resolved:    "#16a34a",
  closed:      "#6b7280",
};

function SortIcon({ field, sort }: { field: SortField; sort: { field: SortField; dir: SortDir } }) {
  if (sort.field !== field) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return sort.dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />;
}

type TicketRow = {
  id: string;
  number: string;
  title: string;
  type: string;
  priorityId: string | null;
  statusId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  slaBreached: boolean;
  tags: string[];
  createdAt: Date;
  dueDate: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
};

type StatusCountCol = { statusId: string; name: string; count?: unknown; color?: string | null };

export default function TicketsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"overview" | "queue" | "board">("queue");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "createdAt", dir: "desc" });
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [bulkAssigneeEmail, setBulkAssigneeEmail] = useState("");
  const [bulkActionMsg, setBulkActionMsg] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterSla, setFilterSla] = useState<"" | "breached" | "ok">("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Debounce search input so the query only fires after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      // Clear status filter when user starts a new text search for better UX
      if (searchInput) setSelectedStatusId(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const bulkUpdate = trpc.tickets.bulkUpdate.useMutation({
    onSuccess: (result) => {
      setBulkActionMsg(`Updated ${result.updatedCount} ticket${result.updatedCount !== 1 ? "s" : ""}`);
      setSelectedRows(new Set());
      setShowAssignPanel(false);
      setBulkAssigneeEmail("");
      refetch();
      setTimeout(() => setBulkActionMsg(null), 3000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  const { data: statusCounts } = trpc.tickets.statusCounts.useQuery(undefined, mergeTrpcQueryOpts("tickets.statusCounts", { staleTime: STALE_TIME.LIVE }));
  const statusCountRows = (statusCounts ?? []) as StatusCountCol[];

  const handleBulkClose = () => {
    const closedStatus = statusCountRows.find((s) =>
      ["closed", "resolved", "done"].includes((s.name ?? "").toLowerCase())
    );
    if (!closedStatus) { toast.error("No closed status found. Create a 'Closed' status in Admin → SLA Definitions."); return; }
    bulkUpdate.mutate({ ids: Array.from(selectedRows), data: { statusId: closedStatus.statusId } });
  };
  const { data: priorityList } = trpc.tickets.listPriorities.useQuery(undefined, mergeTrpcQueryOpts("tickets.listPriorities", { staleTime: STALE_TIME.LIVE }));
  const priorityMap = Object.fromEntries((priorityList ?? []).map((p: any) => [p.id, p]));
  const { data, isLoading, isFetching, refetch } = trpc.tickets.list.useQuery({
    search: search || undefined,
    statusId: selectedStatusId ?? undefined,
    limit: 50,
  }, mergeTrpcQueryOpts("tickets.list", {
    staleTime: STALE_TIME.LIVE,
    // Keep previous results visible while a search/filter refetch is in-flight
    // so the table never flashes "0 of 0 records" during a query transition.
    placeholderData: (prev: any) => prev,
  }));

  if (!can("incidents", "read") && !can("requests", "read")) {
    return <AccessDenied module="Service Desk" />;
  }

  const tickets: TicketRow[] = (data?.items as TicketRow[] | undefined) ?? [];
  const total = data?.items?.length ?? 0;

  // Client-side supplemental filters (type + SLA) layered on top of the server query
  const filteredTickets = tickets.filter((t) => {
    if (filterType && t.type !== filterType) return false;
    if (filterSla === "breached" && !t.slaBreached) return false;
    if (filterSla === "ok" && t.slaBreached) return false;
    return true;
  });

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === filteredTickets.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredTickets.map((t) => t.id)));
    }
  };

  const handleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  };

  const statusTabs = [
    { id: null, label: "All", count: total },
    ...statusCountRows.map((s) => ({ id: s.statusId, label: s.name, count: s.count, color: s.color })),
  ];

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col gap-0 rounded border border-border bg-card overflow-hidden">

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-[#f7f8fa] dark:bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Service Desk</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-mono text-muted-foreground">
            {total}
          </span>
          {selectedRows.size > 0 && (
            <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[0.65rem] font-medium">
              {selectedRows.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            <button
              onClick={() => setView("overview")}
              className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", view === "overview" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <LayoutDashboard className="h-3 w-3" />
              Overview
            </button>
            <button
              onClick={() => setView("queue")}
              className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", view === "queue" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <List className="h-3 w-3" />
              Queue
            </button>
            <button
              onClick={() => setView("board")}
              className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", view === "board" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <Kanban className="h-3 w-3" />
              Board
            </button>
          </div>
          <div className="h-4 w-px bg-border" />
          {view === "queue" && selectedRows.size > 0 && (
            <>
              {bulkActionMsg && (
                <span className="text-[11px] text-green-700 font-medium px-2">{bulkActionMsg}</span>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowAssignPanel((v) => !v)}
                  className="rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
                >
                  Assign
                </button>
                {showAssignPanel && (
                  <div className="absolute top-7 left-0 z-50 bg-card border border-border rounded shadow-md p-2 w-56">
                    <p className="text-[10px] text-muted-foreground mb-1">Assign {selectedRows.size} ticket(s) to:</p>
                    <select
                      className="w-full text-xs border border-border rounded px-2 py-1 mb-2 bg-background"
                      value={bulkAssigneeEmail}
                      onChange={(e) => setBulkAssigneeEmail(e.target.value)}
                    >
                      <option value="">— Select agent —</option>
                      <option value="self">Assign to me</option>
                      <option value="unassign">Unassign</option>
                    </select>
                    <div className="flex gap-1">
                      <button
                        disabled={bulkUpdate.isPending}
                        onClick={() => {
                          if (bulkAssigneeEmail === "unassign") {
                            bulkUpdate.mutate({ ids: Array.from(selectedRows), data: { assigneeId: null } });
                          } else {
                            bulkUpdate.mutate({ ids: Array.from(selectedRows), data: {} });
                          }
                        }}
                        className="flex-1 rounded bg-primary text-white text-[11px] py-1 hover:bg-primary/90 disabled:opacity-50"
                      >
                        {bulkUpdate.isPending ? "…" : "Apply"}
                      </button>
                      <button onClick={() => setShowAssignPanel(false)} className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent">✕</button>
                    </div>
                  </div>
                )}
              </div>
              <button
                disabled={bulkUpdate.isPending}
                onClick={handleBulkClose}
                className="rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {bulkUpdate.isPending ? "…" : "Close"}
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
            </>
          )}
          {view === "queue" && (
            <>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${showFilters ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <Filter className="h-3 w-3" />
                Filters
                {(filterType || filterSla) && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
              <button
                onClick={() => downloadCSV(tickets.map((t) => {
                  const statusName = statusCountRows.find((s) => s.statusId === t.statusId)?.name ?? t.statusId ?? "Unknown";
                  return { Number: t.number, Title: t.title, Type: t.type, Status: statusName, SLA_Breached: t.slaBreached ? "Yes" : "No", Assignee: t.assigneeId ?? "Unassigned", Created: new Date(t.createdAt).toLocaleDateString("en-IN") };
                }), "tickets_export")}
                className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </>
          )}
          <button
            onClick={() => refetch()}
            className="rounded border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          {can("incidents", "write") && (
            <Link
              href="/app/tickets/new"
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Ticket
            </Link>
          )}
        </div>
      </div>

      {/* ─── Overview panel ───────────────────────────────────────── */}
      {view === "overview" && (
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          {/* KPIs computed from live data */}
          {(() => {
            const allTickets: TicketRow[] = (data?.items as TicketRow[] | undefined) ?? [];
            const openStatuses = statusCountRows.filter((s) =>
              !["resolved","closed","done"].includes((s.name ?? "").toLowerCase())
            );
            const totalOpen = openStatuses.reduce((sum, s) => sum + Number(s.count ?? 0), 0);
            const unassigned = allTickets.filter(t => !t.assigneeId).length;
            const breached = allTickets.filter(t => t.slaBreached).length;
            const slaCompliance = allTickets.length > 0
              ? Math.round(((allTickets.length - breached) / allTickets.length) * 100)
              : 100;
            const resolvedToday = allTickets.filter(t => {
              if (!t.resolvedAt) return false;
              const d = new Date(t.resolvedAt);
              const now = new Date();
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
            }).length;
            const resolvedWithMttr = allTickets.filter(t => t.resolvedAt && t.createdAt);
            const avgMttrH = resolvedWithMttr.length > 0
              ? (resolvedWithMttr.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / resolvedWithMttr.length / 3600000).toFixed(1)
              : "—";

            const liveKpis = [
              { label: "Total Open",       value: String(totalOpen),            color: "text-blue-700",   bg: "bg-blue-50",   icon: Circle },
              { label: "SLA Breached",      value: String(breached),             color: "text-red-700",    bg: "bg-red-50",    icon: AlertTriangle },
              { label: "Resolved Today",    value: String(resolvedToday),         color: "text-green-700",  bg: "bg-green-50",  icon: CheckCircle2 },
              { label: "SLA Compliance",    value: `${slaCompliance}%`,           color: "text-green-700",  bg: "bg-green-50",  icon: Shield },
              { label: "Avg MTTR",          value: avgMttrH === "—" ? "—" : `${avgMttrH}h`, color: "text-orange-700", bg: "bg-orange-50", icon: Clock },
              { label: "Unassigned",        value: String(unassigned),            color: "text-yellow-700", bg: "bg-yellow-50", icon: User },
            ];

            // Type breakdown from live data
            const typeCounts: Record<string, number> = {};
            for (const t of allTickets) {
              typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1;
            }
            const typeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({
              label: TYPE_META[type]?.label ?? type,
              count,
              color: TYPE_COLORS[type] ?? "bg-gray-400",
            }));
            const typeTotal = typeBreakdown.reduce((s, t) => s + t.count, 0);

            // Recent activity = last 6 updated tickets
            const recentActivity = [...allTickets]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 6);

            return (
              <>
                <div className="grid grid-cols-6 gap-2">
                  {liveKpis.map((k) => {
                    const Icon = k.icon;
                    return (
                      <div key={k.label} className={`${k.bg} border border-border rounded p-3 hover:shadow-sm transition-shadow`}>
                        <div className="flex items-start justify-between">
                          <Icon className="w-4 h-4 text-muted-foreground/70" />
                        </div>
                        <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{k.label}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Status breakdown */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">By Status</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {statusCountRows.map((s) => {
                        const maxCount = Math.max(...statusCountRows.map((sc) => Number(sc.count ?? 0)), 1);
                        return (
                          <div key={s.statusId} className="flex items-center gap-2">
                            <span className="text-[11px] text-foreground/80 w-20 truncate">{s.name}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Number(s.count ?? 0) / maxCount * 100)}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-foreground w-6 text-right">{String(s.count ?? 0)}</span>
                          </div>
                        );
                      })}
                      {!statusCountRows.length && <p className="text-[11px] text-muted-foreground/60">No status data yet</p>}
                    </div>
                  </div>

                  {/* Type breakdown */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">By Type</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {typeBreakdown.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/60">No tickets yet</p>
                      ) : typeBreakdown.map((t) => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className="text-[11px] text-foreground/80 w-16">{t.label}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${t.color}`} style={{ width: `${typeTotal > 0 ? Math.round(t.count / typeTotal * 100) : 0}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-foreground w-6 text-right">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent activity */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Activity</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {recentActivity.length === 0 ? (
                        <div className="px-3 py-4 text-[11px] text-muted-foreground/60">No recent tickets</div>
                      ) : recentActivity.map((t) => (
                        <div key={t.id} className="flex items-start gap-2 px-3 py-1.5">
                          <span className="font-mono text-[9px] text-muted-foreground/70 flex-shrink-0 mt-0.5">
                            {new Date(t.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                          </span>
                          <p className="text-[10px] text-foreground/80 leading-snug">
                            <span className="font-mono text-primary">{t.number}</span>
                            {" — "}{t.title}
                            {t.slaBreached && <span className="text-red-500 ml-1">⚠ SLA</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          <div className="flex items-center justify-center">
            <button
              onClick={() => setView("queue")}
              className="flex items-center gap-1.5 px-4 py-2 rounded border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <List className="h-3.5 w-3.5" />
              View Ticket Queue
            </button>
          </div>
        </div>
      )}

      {/* ─── Queue view (status tabs + table + status bar) ───────── */}
      {view === "queue" && <>

      {/* ─── Status tabs + Search ──────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 py-0 bg-card dark:bg-card flex-shrink-0">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-thin">
          {statusTabs.map((tab) => (
            <button
              key={tab.id ?? "all"}
              onClick={() => setSelectedStatusId(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                selectedStatusId === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {"color" in tab && tab.color && (
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tab.color }} />
              )}
              {tab.label}
              <span className={cn(
                "rounded px-1 py-0.5 text-[0.6rem] font-mono",
                selectedStatusId === tab.id
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-3 flex-shrink-0">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-48 rounded border border-border bg-background py-1 pl-6 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* ── Filter panel ─────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex items-center gap-4 border-b border-border px-3 py-2 bg-muted/20 flex-shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground">Filter by:</span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs border border-border rounded px-2 py-0.5 bg-background"
            >
              <option value="">All types</option>
              <option value="incident">Incident</option>
              <option value="request">Request</option>
              <option value="problem">Problem</option>
              <option value="change">Change</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">SLA:</span>
            <select
              value={filterSla}
              onChange={(e) => setFilterSla(e.target.value as "" | "breached" | "ok")}
              className="text-xs border border-border rounded px-2 py-0.5 bg-background"
            >
              <option value="">All</option>
              <option value="breached">Breached</option>
              <option value="ok">On Track</option>
            </select>
          </div>
          {(filterType || filterSla) && (
            <button
              onClick={() => { setFilterType(""); setFilterSla(""); }}
              className="text-[11px] text-primary hover:underline ml-1"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {filteredTickets.length} of {tickets.length} shown
          </span>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto scrollbar-thin relative">
        {/* Subtle overlay while a search/filter refetch runs (not initial load) */}
        {isFetching && !isLoading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/30 animate-pulse z-20" />
        )}
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="ent-table">
            <thead className="sticky top-0 z-10">
              <tr>
                {/* Checkbox */}
                <th className="w-8 px-3">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    {selectedRows.size === filteredTickets.length && filteredTickets.length > 0
                      ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      : <Square className="h-3.5 w-3.5" />
                    }
                  </button>
                </th>
                {/* Priority bar space */}
                <th className="w-1 p-0" />
                <th
                  className="sortable w-20"
                  onClick={() => handleSort("number")}
                >
                  <div className="flex items-center gap-1">
                    Number <SortIcon field="number" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center gap-1">
                    Title / Description <SortIcon field="title" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-20"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center gap-1">
                    Type <SortIcon field="type" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-24"
                  onClick={() => handleSort("priority")}
                >
                  <div className="flex items-center gap-1">
                    Priority <SortIcon field="priority" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-28"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status <SortIcon field="status" sort={sort} />
                  </div>
                </th>
                <th className="w-24">Assignee</th>
                <th className="w-20">SLA</th>
                <th
                  className="sortable w-28"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center gap-1">
                    Created <SortIcon field="createdAt" sort={sort} />
                  </div>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <Circle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">No tickets found</p>
                    <p className="text-[0.65rem] text-muted-foreground/60 mt-1">
                      {search ? "Try adjusting your search" : "Create your first ticket to get started"}
                    </p>
                    {!search && (
                      <Link
                        href="/app/tickets/new"
                        className="mt-3 inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                      >
                        <Plus className="h-3 w-3" /> New Ticket
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const isSelected = selectedRows.has(ticket.id);
                  const typeMeta = TYPE_META[ticket.type] ?? { label: ticket.type, color: "#6b7280" };

                  return (
                    <tr
                      key={ticket.id}
                      className={cn(isSelected && "selected")}
                      onClick={() => toggleRow(ticket.id)}
                    >
                      {/* Checkbox */}
                      <td className="w-8" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleRow(ticket.id)} className="text-muted-foreground hover:text-primary">
                          {isSelected
                            ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                            : <Square className="h-3.5 w-3.5" />
                          }
                        </button>
                      </td>

                      {/* Priority color bar */}
                      <td className="w-1 p-0">
                        <div
                          className={`w-1 h-full min-h-[2rem] ${ticket.slaBreached ? "bg-destructive" : "bg-border"}`}
                        />
                      </td>

                      {/* Number */}
                      <td>
                        <Link
                          href={`/app/tickets/${ticket.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mono text-[0.65rem] text-muted-foreground hover:text-primary font-medium"
                        >
                          {ticket.number}
                        </Link>
                      </td>

                      {/* Title */}
                      <td className="max-w-xs" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/app/tickets/${ticket.id}`}
                          className="block font-medium text-foreground hover:text-primary leading-snug line-clamp-1"
                        >
                          {ticket.slaBreached && (
                            <Flame className="inline h-3 w-3 text-red-500 mr-1 flex-shrink-0" />
                          )}
                          {ticket.title}
                        </Link>
                        {ticket.tags && ticket.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Tag className="h-2.5 w-2.5 text-muted-foreground/50" />
                            {ticket.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded bg-muted px-1 py-0.5 text-[0.55rem] text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: typeMeta.color + "18",
                            color: typeMeta.color,
                          }}
                        >
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* Priority */}
                      <td>
                        {ticket.priorityId ? (() => {
                          const p = priorityMap[ticket.priorityId];
                          const name = p?.name ?? "—";
                          const color = p?.color ?? "#6b7280";
                          return (
                            <span className="status-badge text-[10px] font-semibold" style={{ background: color + "22", color }}>
                              {name}
                            </span>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {(() => {
                          const s = statusCountRows.find((sc) => sc.statusId === ticket.statusId);
                          const name = s?.name ?? "Open";
                          const color = s?.color ?? STATUS_COLORS[name.toLowerCase()] ?? "#6b7280";
                          return (
                            <span className="status-badge" style={{ background: color + "22", color }}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {name}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Assignee */}
                      <td>
                        {ticket.assigneeId ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[0.55rem] font-bold text-violet-700 dark:bg-violet-900 dark:text-violet-300 flex-shrink-0">
                              {ticket.assigneeName ? ticket.assigneeName.charAt(0).toUpperCase() : ticket.assigneeId.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[6rem]">
                              {ticket.assigneeName ?? ticket.assigneeEmail ?? "Assigned"}
                            </span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground/60 italic">
                            <User className="h-3 w-3" /> Unassigned
                          </span>
                        )}
                      </td>

                      {/* SLA */}
                      <td>
                        {ticket.slaBreached ? (
                          <span className="sla-breached">
                            <Flame className="h-2.5 w-2.5" /> Breached
                          </span>
                        ) : ticket.dueDate ? (
                          <span className="sla-ok">
                            <Clock className="h-2.5 w-2.5" /> On track
                          </span>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(ticket.createdAt)}
                      </td>

                      {/* Actions */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            className="rounded p-1 text-muted-foreground opacity-0 hover:opacity-100 hover:bg-accent transition group-hover:opacity-100"
                            onClick={() => setMenuOpenId(menuOpenId === ticket.id ? null : ticket.id)}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {menuOpenId === ticket.id && (
                            <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-card border border-border rounded shadow-lg py-1">
                              <button
                                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/30"
                                onClick={() => { setMenuOpenId(null); router.push(`/app/tickets/${ticket.id}`); }}
                              >Open</button>
                              <button
                                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/30"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  const closedStatus = statusCountRows.find((s) => ["closed", "resolved"].includes((s.name ?? "").toLowerCase()));
                                  if (!closedStatus) { toast.error("No closed status found"); return; }
                                  bulkUpdate.mutate({ ids: [ticket.id], data: { statusId: closedStatus.statusId } });
                                }}
                              >Close</button>
                              <button
                                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted/30 text-muted-foreground border-t border-border mt-1 pt-1"
                                onClick={() => { setMenuOpenId(null); router.push(`/app/tickets/${ticket.id}`); }}
                              >Assign…</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Status bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-[#f7f8fa] dark:bg-card flex-shrink-0">
        <p className="text-[0.65rem] text-muted-foreground">
          Showing {filteredTickets.length} of {total} records
          {selectedRows.size > 0 && ` · ${selectedRows.size} selected`}
          {(filterType || filterSla) && ` · filtered`}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          CoheronConnect ITSM · Coheron Platform
        </p>
      </div>

      </>}

      {/* ─── Board view (Kanban by status) ──────────────────────── */}
      {view === "board" && (
        <div className="flex-1 overflow-x-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-3 min-h-[calc(100vh-16rem)]">
              {statusCountRows.map((col) => {
                const colTickets = filteredTickets.filter((t) => t.statusId === col.statusId);
                const colColor = col.color ?? "#6b7280";
                return (
                  <div
                    key={col.statusId ?? col.name}
                    className="flex-shrink-0 w-64 flex flex-col rounded-lg border border-border bg-muted/30 overflow-hidden"
                  >
                    {/* Column header */}
                    <div
                      className="flex items-center justify-between px-3 py-2.5 border-b border-border"
                      style={{ borderTopWidth: 3, borderTopStyle: "solid", borderTopColor: colColor }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: colColor }}
                        />
                        <span className="text-xs font-semibold text-foreground">
                          {col.name}
                        </span>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {colTickets.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                      {colTickets.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground/50 border border-dashed border-border rounded-md">
                          No tickets
                        </div>
                      ) : (
                        colTickets.map((ticket) => {
                          const typeMeta = TYPE_META[ticket.type] ?? { label: ticket.type ?? "Ticket", color: "#6b7280" };
                          const priority = ticket.priorityId ? priorityMap[ticket.priorityId] : null;
                          return (
                            <Link
                              key={ticket.id}
                              href={`/app/tickets/${ticket.id}`}
                              className="block rounded-lg border border-border bg-card p-3 hover:shadow-sm hover:border-primary/30 transition-all group"
                            >
                              {/* Ticket number + type */}
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {ticket.number}
                                </span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: typeMeta.color + "18", color: typeMeta.color }}
                                >
                                  {typeMeta.label}
                                </span>
                              </div>

                              {/* Title */}
                              <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 mb-2">
                                {ticket.slaBreached && (
                                  <Flame className="inline h-3 w-3 text-red-500 mr-1" />
                                )}
                                {ticket.title}
                              </p>

                              {/* Footer */}
                              <div className="flex items-center justify-between gap-1">
                                {priority ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                    style={{ background: priority.color + "22", color: priority.color }}
                                  >
                                    {priority.name}
                                  </span>
                                ) : (
                                  <span />
                                )}
                                {ticket.assigneeId ? (
                                  <div className="flex items-center gap-1">
                                    <div className="h-5 w-5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-[9px] font-bold text-violet-700 dark:text-violet-300 flex-shrink-0">
                                      {ticket.assigneeName ? ticket.assigneeName.charAt(0).toUpperCase() : "?"}
                                    </div>
                                  </div>
                                ) : (
                                  <User className="h-3.5 w-3.5 text-muted-foreground/40" />
                                )}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Fallback when no statuses loaded */}
              {statusCountRows.length === 0 && (
                <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
                  No status columns configured. Set up ticket statuses in Administration.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
